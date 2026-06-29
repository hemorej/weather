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
      <div style="height:100vh;background:#fff;display:flex;align-items:center;justify-content:center;">
        <span style="font-family:'Hanken Grotesk',system-ui,sans-serif;font-size:15px;font-weight:500;color:#9a9a9a;">
          Loading…
        </span>
      </div>
    </template>
  </ClientOnly>
</template>
