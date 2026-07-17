<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  bodyAttrs: { style: 'height:100%;' },
})
</script>

<template>
  <ClientOnly>
    <WeatherApp />
    <template #fallback>
      <div class="fallback-loading">
        <span>Loading…</span>
      </div>
    </template>
  </ClientOnly>
</template>

<style scoped>
.fallback-loading {
  height: 100vh;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fallback-loading span {
  font-family: 'Hanken Grotesk', system-ui, sans-serif;
  font-size: 15px;
  font-weight: 500;
  color: #9a9a9a;
}
@media (prefers-color-scheme: dark) {
  .fallback-loading { background: hsl(212 26% 12%); }
  .fallback-loading span { color: #7c8791; }
}
</style>
