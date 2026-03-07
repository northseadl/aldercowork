<template>
  <div class="app-shell">
    <slot name="header" />
    <slot name="sidebar" />
    <slot name="content" />
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  grid-template-rows: var(--header-h) 1fr;
  height: 100vh;
  padding-right: var(--sp);
  padding-bottom: var(--sp);
  background: var(--shell);
  transition: background var(--speed-regular);
}

@media (max-width: 768px) {
  .app-shell {
    grid-template-columns: 1fr;
  }
}

</style>
