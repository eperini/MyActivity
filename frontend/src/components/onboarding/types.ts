export interface TourStep {
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto";
  beforeShow?: () => void;
  action?: "click" | "observe";
  highlightPadding?: number;
}

export interface Tour {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: TourStep[];
  estimatedMinutes: number;
}
