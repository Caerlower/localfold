"use client";

import type { ReactNode } from "react";
import type { ToolId } from "@/lib/tools";
import { OrganizePdfWorkspace } from "@/components/OrganizePdfWorkspace";
import { SplitStudio } from "./SplitStudio";
import { WatermarkStudio } from "./WatermarkStudio";
import { PageNumbersStudio } from "./PageNumbersStudio";
import { EditStudio } from "./EditStudio";
import { RotateStudio } from "./RotateStudio";
import { CropStudio } from "./CropStudio";
import { RedactStudio } from "./RedactStudio";

const STUDIO_TOOLS: Partial<Record<ToolId, () => ReactNode>> = {
  "organize-pdf": () => <OrganizePdfWorkspace />,
  "split-pdf": () => <SplitStudio />,
  watermark: () => <WatermarkStudio />,
  "page-numbers": () => <PageNumbersStudio />,
  "edit-pdf": () => <EditStudio />,
  "rotate-pdf": () => <RotateStudio />,
  "crop-pdf": () => <CropStudio />,
  "redact-pdf": () => <RedactStudio />,
};

export function getStudioForTool(id: ToolId) {
  const render = STUDIO_TOOLS[id];
  return render ? render() : null;
}

export function isStudioTool(id: ToolId) {
  return id in STUDIO_TOOLS;
}
