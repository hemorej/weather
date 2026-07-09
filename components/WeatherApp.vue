<script setup lang="ts">
import type { GeoLocation, WeatherData, WeatherDaily } from '~/types/weather'
import { useWeatherCache, useLocationStorage, fetchWeatherData } from '~/composables/useWeather'
import { useGeocoding } from '~/composables/useGeocoding'
import { useTemperatureColor } from '~/composables/useTemperatureColor'

// ── Default location ──────────────────────────────────────────────────────────
const DEFAULT_LOCATION: GeoLocation = {
  name: 'Montreal', country: 'CA', state: 'Quebec', lat: 45.5088, lon: -73.5878,
}

// ── State ─────────────────────────────────────────────────────────────────────
const location       = ref<GeoLocation>(DEFAULT_LOCATION)
const weatherData    = ref<WeatherData | null>(null)
const loading        = ref(true)
const error          = ref<string | null>(null)
const showLoading    = ref(false)
let shownAt = 0

watch(loading, (isLoading) => {
  if (isLoading) {
    showLoading.value = true
    shownAt = Date.now()
  } else {
    const remain = Math.max(0, 200 - (Date.now() - shownAt))
    setTimeout(() => { showLoading.value = false }, remain)
  }
}, { immediate: true })
const bgColor        = ref('#ffffff')
const selectedDayIdx = ref<number | null>(null)

const editingCity   = ref(false)
const searchQuery   = ref('')
const searchResults = ref<GeoLocation[]>([])

// ── Template refs ─────────────────────────────────────────────────────────────
const cityInputEl = ref<HTMLInputElement | null>(null)
const hourlyEl    = ref<HTMLElement | null>(null)

// ── Composables ───────────────────────────────────────────────────────────────
const cache    = useWeatherCache()
const storage  = useLocationStorage()
const geo      = useGeocoding()
const { tintFor } = useTemperatureColor()

// ── Date string ───────────────────────────────────────────────────────────────
const dateStr = computed(() => {
  const now = new Date()
  const months  = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  return `${weekdays[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`
})

// ── Indicator row ─────────────────────────────────────────────────────────────
const indicators = computed(() => {
  if (!weatherData.value) return []
  const c = weatherData.value.current
  return [
    { key: 'rain',     icon: 'rain',     value: `${c.rain}%`,      label: 'Rain',      accent: false },
    { key: 'wind',     icon: 'wind',     value: `${c.wind} km/h`,  label: `Wind · ${c.windDir}`, accent: false },
    { key: 'humidity', icon: 'humidity', value: `${c.humidity}%`,   label: 'Humidity',  accent: false },
    { key: 'aqi',      icon: 'leaf',     value: String(c.aqi),      label: c.aqiLabel,  accent: false },
    ...(c.alertActive ? [{ key: 'alert', icon: 'alert', value: c.alertText, label: 'Alert', accent: true }] : []),
  ]
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function condIconName(cond: string, isNight: boolean): string {
  if (cond === 'clear') return isNight ? 'moon' : 'sun'
  if (cond === 'partly') return isNight ? 'partlyNight' : 'partly'
  return cond
}

// The daily conditionCode comes from OWM's own icon pick, which can disagree
// with our derived rain probability (e.g. "cloudy" on a day that's 100%
// likely to rain). Above the threshold, force the rain icon so they agree.
function dailyIconName(d: WeatherDaily): string {
  if (d.precip >= 50 && d.conditionCode !== 'storm') return 'rain'
  return condIconName(d.conditionCode, false)
}

// ── Weather fetch (cache-first, 10-min TTL) ───────────────────────────────────
async function loadWeather(loc: GeoLocation) {
  loading.value = true
  error.value = null
  selectedDayIdx.value = null

  const cached = cache.get(loc.lat, loc.lon)
  if (cached) {
    weatherData.value = cached
    bgColor.value = tintFor(cached.current.temp)
    loading.value = false
    return
  }

  try {
    const data = await fetchWeatherData(loc)
    weatherData.value = data
    cache.set(loc.lat, loc.lon, data)
    bgColor.value = tintFor(data.current.temp)
  } catch (err: unknown) {
    const msg = (err as { data?: { message?: string } })?.data?.message
    error.value = msg ?? 'Failed to load weather. Check your API key and try again.'
  } finally {
    loading.value = false
  }
}

// ── City edit ─────────────────────────────────────────────────────────────────
function openCityEdit() {
  editingCity.value = true
  searchQuery.value = location.value.name
  searchResults.value = []
  nextTick(() => {
    cityInputEl.value?.focus()
    cityInputEl.value?.select()
  })
}

let searchTimer: ReturnType<typeof setTimeout> | null = null

function onCityInput() {
  if (searchTimer) clearTimeout(searchTimer)
  const q = searchQuery.value.trim()
  if (q.length < 2) { searchResults.value = []; return }
  searchTimer = setTimeout(async () => {
    try { searchResults.value = await geo.searchCity(q) }
    catch { searchResults.value = [] }
  }, 300)
}

async function selectLocation(loc: GeoLocation) {
  location.value = loc
  storage.save(loc)
  editingCity.value = false
  searchResults.value = []
  searchQuery.value = ''
  await loadWeather(loc)
}

async function commitCity(val: string) {
  const trimmed = val.trim()
  if (!trimmed) {
    editingCity.value = false
    searchResults.value = []
    searchQuery.value = ''
    return
  }

  // Use first dropdown result if available
  if (searchResults.value.length > 0) {
    await selectLocation(searchResults.value[0]!)
    return
  }

  // Otherwise geocode the typed name
  try {
    const results = await geo.searchCity(trimmed)
    if (results.length > 0) {
      await selectLocation(results[0]!)
    } else {
      // Not found — keep current location
      editingCity.value = false
      searchQuery.value = ''
      searchResults.value = []
    }
  } catch {
    editingCity.value = false
    searchQuery.value = ''
    searchResults.value = []
  }
}

function onCityKey(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); commitCity(searchQuery.value) }
  else if (e.key === 'Escape') {
    editingCity.value = false
    searchResults.value = []
    searchQuery.value = ''
  }
}

function onCityBlur() {
  // Timeout lets @mousedown.prevent on dropdown items run first
  setTimeout(() => {
    if (editingCity.value) commitCity(searchQuery.value)
  }, 150)
}

// ── Hourly filtered to selected day (or first 24 h when none selected) ────────
const todayDailyIdx = computed(() => {
  const now = new Date()
  return weatherData.value?.daily.findIndex(d => {
    const date = new Date(d.dt * 1000)
    return date.getFullYear() === now.getFullYear() &&
           date.getMonth()    === now.getMonth()    &&
           date.getDate()     === now.getDate()
  }) ?? -1
})

const displayedHourly = computed(() => {
  if (selectedDayIdx.value === null || selectedDayIdx.value === todayDailyIdx.value) {
    return weatherData.value?.hourly ?? []
  }
  const dayDt = weatherData.value!.daily[selectedDayIdx.value]!.dt
  const dayDate = new Date(dayDt * 1000)
  return (weatherData.value?.forecast ?? []).filter(h => {
    const d = new Date(h.dt * 1000)
    return d.getFullYear() === dayDate.getFullYear() &&
           d.getMonth()    === dayDate.getMonth()    &&
           d.getDate()     === dayDate.getDate()
  })
})

const hourlyLabel = computed(() => {
  if (selectedDayIdx.value === null || selectedDayIdx.value === todayDailyIdx.value) return 'Hourly'
  return weatherData.value?.daily[selectedDayIdx.value]?.dayLabel ?? 'Hourly'
})

function selectDay(i: number) {
  selectedDayIdx.value = selectedDayIdx.value === i ? null : i
  nextTick(() => {
    hourlyEl.value?.scrollTo({ top: 0 })
    const first = displayedHourly.value[0]
    bgColor.value = first
      ? tintFor(first.temp)
      : tintFor(weatherData.value?.current.temp ?? 20)
  })
}

// ── Hourly scroll → background tint ──────────────────────────────────────────
function onHourlyScroll() {
  const el = hourlyEl.value
  if (!el || !weatherData.value) return
  const hrs = displayedHourly.value
  if (!hrs.length) return
  const rowH = 44
  const idx = Math.max(0, Math.min(hrs.length - 1, Math.round(el.scrollTop / rowH)))
  bgColor.value = tintFor(hrs[idx]!.temp)
}

// ── Mount ─────────────────────────────────────────────────────────────────────
onMounted(() => {
  const saved = storage.load()
  if (saved) location.value = saved
  loadWeather(location.value)
})
</script>

<template>
  <div
    :style="{ backgroundColor: bgColor, transition: 'background-color .55s ease' }"
    style="height:100vh;display:flex;justify-content:center;color:#111;font-family:'Hanken Grotesk',system-ui,-apple-system,sans-serif;overflow:hidden;"
  >
    <div style="width:100%;max-width:540px;height:100%;display:flex;flex-direction:column;padding:0 30px;" :aria-busy="showLoading">

      <!-- ── HEADER ─────────────────────────────────────────────────────────── -->
      <header style="flex-shrink:0;text-align:left;padding-top:clamp(34px,6.5vh,76px);">

        <!-- Temperature + date/city row -->
        <div style="display:flex;align-items:flex-start;gap:22px;">
          <!-- Temperature -->
          <div style="font-size:clamp(94px,17vw,126px);font-weight:200;line-height:.84;letter-spacing:-0.045em;color:#0f0f0f;">
            {{ weatherData ? `${weatherData.current.temp}°` : '—' }}
          </div>

          <!-- Date + city -->
          <div style="padding-top:clamp(4px,1vh,10px);min-width:0;flex:1;">
            <div style="font-size:17px;font-weight:500;color:#9a9a9a;letter-spacing:.2px;margin-bottom:5px;">
              {{ dateStr }}
            </div>

            <!-- City button or edit input -->
            <div style="position:relative;">
              <button
                v-if="!editingCity"
                class="city-btn"
                @click="openCityEdit"
              >
                {{ location.name }}
              </button>

              <template v-else>
                <input
                  ref="cityInputEl"
                  v-model="searchQuery"
                  class="city-input"
                  placeholder="Enter a city"
                  autocomplete="off"
                  spellcheck="false"
                  @input="onCityInput"
                  @keydown="onCityKey"
                  @blur="onCityBlur"
                />

                <!-- Search dropdown -->
                <div v-if="searchResults.length > 0" class="search-dropdown">
                  <button
                    v-for="result in searchResults"
                    :key="`${result.lat},${result.lon}`"
                    class="search-result"
                    @mousedown.prevent="selectLocation(result)"
                  >
                    <span class="result-name">{{ result.name }}</span>
                    <span class="result-meta">
                      <template v-if="result.state">{{ result.state }}, </template>{{ result.country }}
                    </span>
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Indicator row -->
        <div v-if="weatherData" style="display:flex;justify-content:space-between;margin-top:clamp(24px,4vh,42px);">
          <div
            v-for="ind in indicators"
            :key="ind.key"
            style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;"
          >
            <WeatherIcon :name="ind.icon" :size="18" style="color:#777;" />
            <div :style="{ fontSize: '14px', fontWeight: 600, color: ind.accent ? '#c2410c' : '#1a1a1a', lineHeight: 1 }">
              {{ ind.value }}
            </div>
            <div style="font-size:10px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:#b4b4b4;">
              {{ ind.label }}
            </div>
          </div>
        </div>

      </header>

      <!-- Error state -->
      <div
        v-if="error"
        style="flex:1;display:flex;align-items:center;justify-content:center;text-align:center;"
      >
        <div>
          <div style="font-size:15px;color:#9a9a9a;margin-bottom:8px;">{{ error }}</div>
          <button class="retry-btn" @click="loadWeather(location)">Try again</button>
        </div>
      </div>

      <template v-else>
        <!-- ── FORECAST COLUMNS ─────────────────────────────────────────────── -->
        <div class="forecast-row" style="flex-shrink:0;display:flex;justify-content:flex-start;gap:60px;margin-top:clamp(40px,7vh,72px);">

          <!-- 7-Day column (left) -->
          <section class="forecast-col" style="width:184px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;">
            <div style="font-size:10px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:#b4b4b4;margin-bottom:12px;flex-shrink:0;">7-Day</div>
            <div class="nb" style="height:308px;overflow-y:auto;">
              <div
                v-for="(d, i) in (weatherData?.daily ?? [])"
                :key="i"
                class="day-row"
                :class="{ 'day-row--selected': selectedDayIdx === i && i !== todayDailyIdx }"
                style="display:grid;grid-template-columns:34px 1fr 34px auto;align-items:center;column-gap:8px;height:44px;border-bottom:1px solid #f4f4f4;cursor:pointer;"
                @click="selectDay(i)"
              >
                <div :style="{ fontSize:'14px', fontWeight: selectedDayIdx === i ? 600 : 500, color:'#1a1a1a', width:'34px' }">{{ d.dayLabel }}</div>
                <div style="display:flex;justify-content:center;color:#2a2a2a;">
                  <WeatherIcon :name="dailyIconName(d)" :size="22" />
                </div>
                <div style="text-align:right;font-size:11px;font-weight:600;color:#6aa0d4;">{{ d.precip > 0 ? `${d.precip}%` : '' }}</div>
                <div style="text-align:right;white-space:nowrap;font-size:14px;letter-spacing:.01em;">
                  <span style="font-weight:600;color:#141414;">{{ d.high }}°</span><span style="color:#d2d2d2;font-weight:400;margin:0 3px;">/</span><span style="font-weight:400;color:#b0b0b0;">{{ d.low }}°</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Hourly column (right) -->
          <section class="forecast-col" style="width:184px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;">
            <div style="font-size:10px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:#b4b4b4;margin-bottom:12px;flex-shrink:0;">{{ hourlyLabel }}</div>
            <div ref="hourlyEl" class="nb" style="height:308px;overflow-y:auto;" @scroll="onHourlyScroll">
              <template v-if="displayedHourly.length">
                <div
                  v-for="h in displayedHourly"
                  :key="h.dt"
                  class="hourly-row"
                  style="display:grid;grid-template-columns:34px 1fr 34px 30px;align-items:center;column-gap:8px;height:44px;border-bottom:1px solid #f4f4f4;"
                >
                  <div :style="{ fontSize:'14px', fontWeight: h.label === 'Now' ? 700 : 500, color: h.label === 'Now' ? '#111' : '#8a8a8a', width:'34px' }">
                    {{ h.label === 'Now' ? 'Now' : `${h.label}h` }}
                  </div>
                  <div style="display:flex;justify-content:center;color:#2a2a2a;">
                    <WeatherIcon :name="condIconName(h.conditionCode, h.isNight)" :size="22" />
                  </div>
                  <div style="text-align:right;font-size:11px;font-weight:600;color:#6aa0d4;">{{ h.precip > 0 ? `${h.precip}%` : '' }}</div>
                  <div style="text-align:right;font-size:14px;font-weight:600;color:#141414;">{{ h.temp }}°</div>
                </div>
              </template>
              <div v-else-if="weatherData" style="height:100%;display:flex;align-items:center;justify-content:center;font-size:13px;color:#c0c0c0;">
                No hourly data
              </div>
            </div>
          </section>

        </div>
      </template>


    </div>
  <!-- ── LOADING OVERLAY (full-viewport) ─────────────────────────────────── -->
  <Transition name="load-fade">
    <div v-if="showLoading && !error" class="load-overlay" aria-hidden="true">
      <div class="load-overlay__inner">
        <!-- Header skeleton -->
        <div style="flex-shrink:0;padding-top:clamp(34px,6.5vh,76px);">
          <div style="display:flex;align-items:flex-start;gap:22px;">
            <div class="sk sk--temp" />
            <div style="padding-top:12px;display:flex;flex-direction:column;gap:10px;">
              <div class="sk" style="width:118px;height:13px;border-radius:6px;" />
              <div class="sk" style="width:148px;height:22px;border-radius:7px;animation-delay:.1s;" />
            </div>
          </div>
          <!-- Indicators skeleton -->
          <div style="display:flex;justify-content:space-between;margin-top:clamp(24px,4vh,42px);">
            <div v-for="n in 5" :key="n" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;">
              <div class="sk sk--circle" />
              <div class="sk" style="width:42px;height:13px;border-radius:5px;animation-delay:.08s;" />
              <div class="sk sk--light" style="width:28px;height:8px;border-radius:4px;animation-delay:.14s;" />
            </div>
          </div>
        </div>
        <!-- Forecast skeleton -->
        <div style="flex-shrink:0;display:flex;justify-content:space-between;gap:60px;margin-top:clamp(40px,7vh,72px);">
          <div v-for="col in 2" :key="col" style="width:184px;flex-shrink:0;">
            <div class="sk" style="width:56px;height:10px;border-radius:5px;margin-bottom:14px;" />
            <div v-for="row in 7" :key="row" class="sk-row">
              <div class="sk" style="width:30px;height:13px;border-radius:5px;" />
              <div class="sk sk--circle sk--light" style="animation-delay:.1s;" />
              <div class="sk" style="width:40px;height:13px;border-radius:5px;animation-delay:.05s;" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
  </div>
</template>

<style scoped>
.city-btn {
  background: none;
  border: none;
  font-family: inherit;
  font-size: 24px;
  font-weight: 600;
  color: #1a1a1a;
  letter-spacing: -0.01em;
  cursor: pointer;
  padding: 0;
  text-align: left;
  line-height: 1;
}
.city-btn:hover { color: #000; }

.city-input {
  font-family: inherit;
  font-size: 24px;
  font-weight: 600;
  color: #111;
  background: transparent;
  border: none;
  border-bottom: 1.5px solid #d4d4d4;
  outline: none;
  padding: 0 0 2px;
  width: 100%;
  line-height: 1;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 240px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  z-index: 100;
}

.search-result {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  padding: 10px 14px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  border-bottom: 1px solid #f4f4f4;
}
.search-result:last-child { border-bottom: none; }
.search-result:hover { background: #f8f8f8; }

.result-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.3;
}
.result-meta {
  font-size: 12px;
  font-weight: 500;
  color: #9a9a9a;
}

.retry-btn {
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  background: none;
  border: 1.5px solid #d4d4d4;
  border-radius: 8px;
  padding: 8px 20px;
  cursor: pointer;
}
.retry-btn:hover { background: #f5f5f5; }

.day-row { transition: background .15s ease; }
.day-row:hover { background: rgba(0,0,0,0.03); }
.day-row--selected { position: relative; }
.day-row--selected::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: -30px;
  height: 2px;
  background: #1a1a1a;
  z-index: 1;
}

.forecast-col:first-child { position: relative; }
.forecast-col:first-child::after {
  content: '';
  position: absolute;
  right: -30px; /* half of the 60px gap */
  top: 0;
  bottom: 0;
  width: 1px;
  background: #e8e8e8;
}

@keyframes tintBreathe {
  0%, 100% { background-color: hsl(212 38% 96.5%); }
  50%       { background-color: hsl(212 50% 93.5%); }
}
@keyframes skpulse {
  0%, 100% { opacity: .5; }
  50%       { opacity: .9; }
}

.load-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  overflow: hidden;
  background: hsl(212 44% 95%);
  animation: tintBreathe 4.5s ease-in-out infinite;
}
.load-overlay__inner {
  width: 100%;
  max-width: 540px;
  padding: 0 30px;
  display: flex;
  flex-direction: column;
}

.load-fade-leave-active { transition: opacity .55s ease; }
.load-fade-leave-to     { opacity: 0; }

.sk {
  background: rgba(17, 17, 17, 0.06);
  animation: skpulse 1.9s ease-in-out infinite;
}
.sk--light  { background: rgba(17, 17, 17, 0.05); }
.sk--temp   { width: 186px; height: 104px; border-radius: 14px; flex-shrink: 0; }
.sk--circle { width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; }

.sk-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.035);
}

@media (max-width: 480px) {
  .forecast-row { gap: 16px !important; }
  .forecast-col:first-child { width: auto !important; flex: 1 1 0 !important; min-width: 0; max-width: 50%; }
  .forecast-col:first-child::after { right: -8px; } /* half of the 16px gap */
  .forecast-col:last-child  { width: auto !important; flex: 0 0 auto !important; }
  .hourly-row { grid-template-columns: 34px 1fr 34px 30px !important; }
  .day-row--selected::after { right: -8px; }
}
</style>
