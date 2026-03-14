import type { Tour } from "../types";
import { welcomeTour } from "./welcome";
import { organizationTour } from "./organization";
import { productivityTour } from "./productivity";
import { habitsTour } from "./habits";
import { collaborationTour } from "./collaboration";
import { advancedTour } from "./advanced";

export const tours: Tour[] = [
  welcomeTour,
  organizationTour,
  productivityTour,
  habitsTour,
  collaborationTour,
  advancedTour,
];

export {
  welcomeTour,
  organizationTour,
  productivityTour,
  habitsTour,
  collaborationTour,
  advancedTour,
};
