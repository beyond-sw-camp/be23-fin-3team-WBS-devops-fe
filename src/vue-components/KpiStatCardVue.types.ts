export interface KpiStatCardProps {
  title: string;
  subtitle?: string;
  value: number;
  suffix?: string;
  accent: string;
  iconHtml?: string;
  onClick?: () => void;
}
