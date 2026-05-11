import type { ComponentType } from 'react';
import { applyVueInReact } from 'veaury';
import KpiStatCardVue from './KpiStatCardVue.vue';
import type { KpiStatCardProps } from './KpiStatCardVue.types';

export const KpiStatCardReact = applyVueInReact(
  KpiStatCardVue,
) as unknown as ComponentType<KpiStatCardProps>;

export type { KpiStatCardProps };

export const KPI_ICON_NEW_ORDER = `<svg viewBox="64 64 896 896" focusable="false" fill="currentColor" aria-hidden="true"><path d="M854.6 288.6L639.4 73.4c-6-6-14.1-9.4-22.6-9.4H192c-17.7 0-32 14.3-32 32v832c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V311.3c0-8.5-3.4-16.7-9.4-22.7zM790.2 326H602V137.8L790.2 326zm1.8 562H232V136h302v216a42 42 0 0042 42h216v494zM504 618H320c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8h184c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8zM312 490v48c0 4.4 3.6 8 8 8h384c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H320c-4.4 0-8 3.6-8 8z"/></svg>`;

export const KPI_ICON_NEW_PURCHASE = `<svg viewBox="64 64 896 896" focusable="false" fill="currentColor" aria-hidden="true"><path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32zm-40 728H184V184h656v656zM653.3 477.5L506.5 624.3 370.7 488.5c-3.1-3.1-8.2-3.1-11.3 0l-36.8 36.8c-3.1 3.1-3.1 8.2 0 11.3l178.1 178.1c3.1 3.1 8.2 3.1 11.3 0l188.7-188.7c3.1-3.1 3.1-8.2 0-11.3l-36.8-36.8c-3.1-3.1-8.2-3.1-11.3 0z"/></svg>`;
