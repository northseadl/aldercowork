<template>
  <main class="content">
    <slot />
  </main>
</template>

<style scoped>
.content {
  background: var(--content);
  border-radius: var(--r-content);
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-content);
  display: flex;
  flex-direction: column;
  view-transition-name: main-content;
}

.content::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: var(--noise-opacity);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 256px 256px;
}

@media (max-width: 768px) {
  .content {
    border-radius: 0;
  }
}
</style>
