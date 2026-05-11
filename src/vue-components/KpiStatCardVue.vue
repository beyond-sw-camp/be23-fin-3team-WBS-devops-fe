<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { KpiStatCardProps } from './KpiStatCardVue.types';

const props = withDefaults(defineProps<KpiStatCardProps>(), {
  suffix: '건',
  subtitle: '',
  iconHtml: '',
});

const displayValue = ref(props.value);

watch(
  () => props.value,
  (next, prev) => {
    const start = typeof prev === 'number' ? prev : 0;
    const duration = 600;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      displayValue.value = Math.round(start + (next - start) * k);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
);

const accentSoft = computed(() => `${props.accent}22`);
const accentBorder = computed(() => `${props.accent}40`);
const accentBg = computed(
  () => `linear-gradient(160deg, ${props.accent}18, transparent)`,
);

const handleClick = () => {
  if (props.onClick) props.onClick();
};
</script>

<template>
  <div
    class="kpi-card"
    :class="{ clickable: !!onClick }"
    @click="handleClick"
  >
    <div class="kpi-vue-tag">Vue</div>
    <div class="kpi-row">
      <div
        class="kpi-icon"
        :style="{
          color: accent,
          borderColor: accentBorder,
          boxShadow: `0 0 20px ${accentSoft}`,
          background: accentBg,
        }"
        v-html="iconHtml"
      />
      <div class="kpi-body">
        <div class="kpi-title">{{ title }}</div>
        <div v-if="subtitle" class="kpi-subtitle">{{ subtitle }}</div>
        <Transition name="kpi-fade" mode="out-in">
          <div
            class="kpi-value"
            :key="displayValue"
            :style="{ color: accent }"
          >
            {{ displayValue }}<span class="kpi-suffix">{{ suffix }}</span>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kpi-card {
  position: relative;
  height: 100%;
  min-height: 104px;
  padding: 18px 20px;
  background: #ffffff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
  overflow: hidden;
  transition:
    box-shadow 0.2s,
    transform 0.2s;
}
.kpi-card.clickable {
  cursor: pointer;
}
.kpi-card.clickable:hover {
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.kpi-vue-tag {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 9px;
  font-weight: 700;
  color: #42b883;
  background: #42b88314;
  border: 1px solid #42b88333;
  border-radius: 4px;
  padding: 1px 5px;
  letter-spacing: 0.4px;
}

.kpi-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.kpi-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
  border: 1px solid;
}
.kpi-icon :deep(svg) {
  width: 22px;
  height: 22px;
}

.kpi-body {
  flex: 1;
  min-width: 0;
}
.kpi-title {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
  margin-bottom: 2px;
}
.kpi-subtitle {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.3;
  margin-bottom: 6px;
}
.kpi-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.15;
}
.kpi-suffix {
  font-size: 15px;
  font-weight: 500;
  margin-left: 4px;
  color: #64748b;
}

.kpi-fade-enter-active,
.kpi-fade-leave-active {
  transition:
    opacity 0.25s,
    transform 0.25s;
}
.kpi-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.kpi-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
