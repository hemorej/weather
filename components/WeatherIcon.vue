<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 22 })
const small = computed(() => props.size <= 32)
</script>

<template>
  <svg
    :viewBox="'0 0 24 24'"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <!-- clear day -->
    <template v-if="name === 'sun'">
      <circle cx="12" cy="12" r="4" />
      <line x1="19.0" y1="12.0" x2="21.6" y2="12.0" />
      <line x1="16.9" y1="16.9" x2="18.8" y2="18.8" />
      <line x1="12.0" y1="19.0" x2="12.0" y2="21.6" />
      <line x1="7.1"  y1="16.9" x2="5.2"  y2="18.8" />
      <line x1="5.0"  y1="12.0" x2="2.4"  y2="12.0" />
      <line x1="7.1"  y1="7.1"  x2="5.2"  y2="5.2"  />
      <line x1="12.0" y1="5.0"  x2="12.0" y2="2.4"  />
      <line x1="16.9" y1="7.1"  x2="18.8" y2="5.2"  />
    </template>

    <!-- clear night -->
    <template v-else-if="name === 'moon'">
      <path d="M21 12.6A7.6 7.6 0 1 1 11.1 3 6.1 6.1 0 0 0 21 12.6Z" />
    </template>

    <!-- overcast -->
    <template v-else-if="name === 'cloudy'">
      <path d="M7 18.5a4.2 4.2 0 0 1-.5-8.37A5.6 5.6 0 0 1 17.6 9.2 3.95 3.95 0 0 1 17 18.5H7Z" />
    </template>

    <!-- partly cloudy day -->
    <template v-else-if="name === 'partly'">
      <defs>
        <mask id="partly-sun-mask">
          <rect width="24" height="24" fill="white"/>
          <path d="M9 19.5a3.6 3.6 0 0 1-.4-7.18A4.85 4.85 0 0 1 18.1 13.2 3.4 3.4 0 0 1 17.5 19.5H9Z" fill="black" stroke="black" stroke-width="1.6" stroke-linejoin="round"/>
        </mask>
      </defs>
      <g mask="url(#partly-sun-mask)">
        <circle cx="8" cy="7.4" r="2.5" />
        <!-- 8 rays around small sun -->
        <line x1="12.0" y1="7.4"  x2="13.3" y2="7.4"  />
        <line x1="10.8" y1="10.2" x2="11.8" y2="11.1" />
        <line x1="8.0"  y1="11.4" x2="8.0"  y2="12.7" />
        <line x1="5.2"  y1="10.2" x2="4.2"  y2="11.1" />
        <line x1="4.0"  y1="7.4"  x2="2.7"  y2="7.4"  />
        <line x1="5.2"  y1="4.6"  x2="4.2"  y2="3.7"  />
        <line x1="8.0"  y1="3.4"  x2="8.0"  y2="2.1"  />
        <line x1="10.8" y1="4.6"  x2="11.8" y2="3.7"  />
      </g>
      <path d="M9 19.5a3.6 3.6 0 0 1-.4-7.18A4.85 4.85 0 0 1 18.1 13.2 3.4 3.4 0 0 1 17.5 19.5H9Z" />
    </template>

    <!-- partly cloudy night -->
    <template v-else-if="name === 'partlyNight'">
      <path d="M13.2 7.4A3.8 3.8 0 1 1 9.6 2.9 3 3 0 0 0 13.2 7.4Z" />
      <path d="M9 19.5a3.6 3.6 0 0 1-.4-7.18A4.85 4.85 0 0 1 18.1 13.2 3.4 3.4 0 0 1 17.5 19.5H9Z" />
    </template>

    <!-- rain -->
    <template v-else-if="name === 'rain'">
      <path d="M7 15.5a4 4 0 0 1-.5-7.97A5.4 5.4 0 0 1 17.4 6.7 3.8 3.8 0 0 1 17 15.5H7Z" />
      <line x1="7.5"  y1="18" x2="6.5"  y2="20.6" />
      <line x1="10.5" y1="18" x2="9.5"  y2="20.6" />
      <line x1="13.5" y1="18" x2="12.5" y2="20.6" />
      <line x1="16.5" y1="18" x2="15.5" y2="20.6" />
    </template>

    <!-- drizzle: two rain-style streaks -->
    <template v-else-if="name === 'drizzle'">
      <path d="M7 15.5a4 4 0 0 1-.5-7.97A5.4 5.4 0 0 1 17.4 6.7 3.8 3.8 0 0 1 17 15.5H7Z" />
      <line x1="10.5" y1="18" x2="9.5"  y2="20.6" />
      <line x1="14.5" y1="18" x2="13.5" y2="20.6" />
    </template>

    <!-- freezing rain / freezing drizzle: dash · flake · dash; cloudless when small -->
    <template v-else-if="name === 'freezingRain'">
      <template v-if="small">
        <line x1="5.92"  y1="8.6" x2="3.68"  y2="15.4" />
        <path d="M12.2 8.6v6.8M9.26 10.3l5.88 3.4M9.26 13.7l5.88-3.4" />
        <line x1="20.72" y1="8.6" x2="18.48" y2="15.4" />
      </template>
      <template v-else>
        <path d="M7 15.5a4 4 0 0 1-.5-7.97A5.4 5.4 0 0 1 17.4 6.7 3.8 3.8 0 0 1 17 15.5H7Z" />
        <line x1="9.03"  y1="17.9" x2="7.97"  y2="21.1" />
        <path d="M12.2 17.6v3.8M10.55 18.55l3.3 1.9M10.55 20.45l3.3-1.9" stroke-width="1.4" />
        <line x1="16.53" y1="17.9" x2="15.47" y2="21.1" />
      </template>
    </template>

    <!-- thunderstorm: filled bolt, no cloud when small -->
    <template v-else-if="name === 'storm'">
      <template v-if="small">
        <path d="M11.76 3.36L6.24 11.76H12.24L7.92 20.64L17.76 10.08H12L14.88 3.36Z" fill="currentColor" />
      </template>
      <template v-else>
        <path d="M7 15.5a4 4 0 0 1-.5-7.97A5.4 5.4 0 0 1 17.4 6.7 3.8 3.8 0 0 1 17 15.5H7Z" />
        <path d="M12.6 14l-2.3 3.5h2.5L11 21.2l4.1-4.4h-2.4L13.9 14Z" />
      </template>
    </template>

    <!-- snow: two large flakes when small, three under a cloud otherwise -->
    <template v-else-if="name === 'snow'">
      <template v-if="small">
        <path d="M7.8 4.3v8.6M4.08 6.45l7.44 4.3M4.08 10.75l7.44-4.3" />
        <path d="M16.2 11.1v8.6M12.48 13.25l7.44 4.3M12.48 17.55l7.44-4.3" />
      </template>
      <template v-else>
        <path d="M7 15.5a4 4 0 0 1-.5-7.97A5.4 5.4 0 0 1 17.4 6.7 3.8 3.8 0 0 1 17 15.5H7Z" />
        <g stroke-width="1.5">
          <path d="M7.6 16.9v4M5.87 17.9l3.46 2M5.87 19.9l3.46-2" />
          <path d="M12 19v4M10.27 20l3.46 2M10.27 22l3.46-2" />
          <path d="M16.4 16.9v4M14.67 17.9l3.46 2M14.67 19.9l3.46-2" />
        </g>
      </template>
    </template>

    <!-- fog / mist -->
    <template v-else-if="name === 'fog'">
      <path d="M7 13.5a4 4 0 0 1-.5-7.97A5.4 5.4 0 0 1 17.4 4.7 3.8 3.8 0 0 1 17 13.5H7Z" />
      <line x1="6"  y1="16.5" x2="18" y2="16.5" />
      <line x1="8"  y1="19.3" x2="16" y2="19.3" />
      <line x1="10" y1="22.1" x2="14" y2="22.1" />
    </template>

    <!-- precipitation indicator -->
    <template v-else-if="name === 'umbrella'">
      <path d="M12 4V2.5" />
      <path d="M3.5 12.5a8.5 8.5 0 0 1 17 0c-1.4-1.2-2.85-1.2-4.25 0-1.4-1.2-2.85-1.2-4.25 0-1.4-1.2-2.85-1.2-4.25 0-1.4-1.2-2.85-1.2-4.25 0Z" />
      <path d="M12 12.5v6.2a2 2 0 0 1-4 0" />
    </template>

    <!-- rain-probability indicator -->
    <template v-else-if="name === 'droplet'">
      <path d="M12 3.5c3.2 3.6 5.3 6.6 5.3 9.3a5.3 5.3 0 0 1-10.6 0C6.7 10.1 8.8 7.1 12 3.5Z" />
    </template>

    <!-- humidity indicator -->
    <template v-else-if="name === 'humidity'">
      <path d="M12 3.5c3.2 3.6 5.3 6.6 5.3 9.3a5.3 5.3 0 0 1-10.6 0C6.7 10.1 8.8 7.1 12 3.5Z" />
      <path d="M7.4 13.6a4.6 4.6 0 0 0 9.2 0" />
    </template>

    <!-- wind indicator -->
    <template v-else-if="name === 'wind'">
      <path d="M3 8.5h8a2.4 2.4 0 1 0-2.4-2.4" />
      <path d="M3 12.5h13a2.4 2.4 0 1 1-2.4 2.4" />
      <line x1="3" y1="16.5" x2="10" y2="16.5" />
    </template>

    <!-- air quality / leaf -->
    <template v-else-if="name === 'leaf'">
      <path d="M5 19.5C5 11 11 5.5 19.5 5.5 19.5 14 13.5 19.5 5 19.5Z" />
      <line x1="8.5" y1="16" x2="16" y2="9" />
    </template>

    <!-- alert / warning triangle -->
    <template v-else-if="name === 'alert'">
      <path d="M12 4 22 19.5H2L12 4Z" />
      <line x1="12" y1="10" x2="12" y2="14.5" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="none" />
    </template>

    <!-- fallback: cloudy -->
    <template v-else>
      <path d="M7 18.5a4.2 4.2 0 0 1-.5-8.37A5.6 5.6 0 0 1 17.6 9.2 3.95 3.95 0 0 1 17 18.5H7Z" />
    </template>
  </svg>
</template>
