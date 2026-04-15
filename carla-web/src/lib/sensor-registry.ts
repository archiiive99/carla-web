import { lazy, createElement, type ComponentType } from "react";
import {
  Camera,
  Layers,
  Grid3x3,
  Eye,
  Wind,
  Box,
  Zap,
  Radar,
  Gauge,
  Navigation,
  AlertTriangle,
  ArrowLeftRight,
  CircleAlert,
  type LucideIcon,
} from "lucide-react";
import { SensorType } from "@/types/carla";

export type SensorCategory =
  | "camera"
  | "lidar"
  | "radar"
  | "imu"
  | "gnss"
  | "event";

interface SensorViewProps {
  sensorId: number;
  className?: string;
}

export interface SensorRegistryEntry {
  component: ComponentType<SensorViewProps>;
  displayName: string;
  icon: LucideIcon;
  category: SensorCategory;
}

const CameraView = lazy(() => import("@/components/sensors/CameraView"));
const SegmentationView = lazy(() => import("@/components/sensors/SegmentationView"));
// RGB camera renders via the shared-scene compositor, not the JPEG stream.
// Depth / seg / normals / optical-flow / DVS / instance-seg still come as
// engine-derived image payloads over the wire, so they keep CameraView.
const SensorCameraView = lazy(() => import("@/components/sensors/SensorCameraView"));
const LidarView = lazy(() => import("@/components/sensors/LidarView"));
const RadarView = lazy(() => import("@/components/sensors/RadarView"));
const ImuChart = lazy(() => import("@/components/sensors/ImuChart"));
const GnssView = lazy(() => import("@/components/sensors/GnssView"));
const CollisionLog = lazy(() => import("@/components/sensors/CollisionLog"));
const LaneInvasionLog = lazy(() => import("@/components/sensors/LaneInvasionLog"));

// Every CameraRgb-adjacent sensor (depth / instance-seg / optical-flow /
// normals / DVS) renders identical UI to the RGB camera with only a different
// header label. Rather than file-per-label wrappers, bind the label here.
function labeledCamera(label: string): ComponentType<SensorViewProps> {
  const Component = (props: SensorViewProps) =>
    createElement(CameraView, { ...props, label });
  Component.displayName = `CameraView(${label})`;
  return Component;
}

const DepthView = labeledCamera("Depth Camera");
const InstanceSegView = labeledCamera("Instance Segmentation");
const OpticalFlowView = labeledCamera("Optical Flow");
const NormalsView = labeledCamera("Surface Normals");
const DvsView = labeledCamera("DVS Events");

export const SENSOR_REGISTRY: Record<string, SensorRegistryEntry> = {
  [SensorType.CameraRgb]: {
    component: SensorCameraView,
    displayName: "RGB Camera",
    icon: Camera,
    category: "camera",
  },
  [SensorType.CameraDepth]: {
    component: DepthView,
    displayName: "Depth Camera",
    icon: Layers,
    category: "camera",
  },
  [SensorType.CameraSemanticSeg]: {
    component: SegmentationView,
    displayName: "Semantic Segmentation",
    icon: Grid3x3,
    category: "camera",
  },
  [SensorType.CameraInstanceSeg]: {
    component: InstanceSegView,
    displayName: "Instance Segmentation",
    icon: Grid3x3,
    category: "camera",
  },
  [SensorType.CameraOpticalFlow]: {
    component: OpticalFlowView,
    displayName: "Optical Flow",
    icon: Wind,
    category: "camera",
  },
  [SensorType.CameraNormals]: {
    component: NormalsView,
    displayName: "Surface Normals",
    icon: Box,
    category: "camera",
  },
  [SensorType.CameraDvs]: {
    component: DvsView,
    displayName: "DVS Events",
    icon: Zap,
    category: "camera",
  },
  [SensorType.LidarRayCast]: {
    component: LidarView,
    displayName: "LiDAR",
    icon: Eye,
    category: "lidar",
  },
  [SensorType.LidarRayCastSemantic]: {
    component: LidarView,
    displayName: "Semantic LiDAR",
    icon: Eye,
    category: "lidar",
  },
  [SensorType.Radar]: {
    component: RadarView,
    displayName: "Radar",
    icon: Radar,
    category: "radar",
  },
  [SensorType.Imu]: {
    component: ImuChart,
    displayName: "IMU",
    icon: Gauge,
    category: "imu",
  },
  [SensorType.Gnss]: {
    component: GnssView,
    displayName: "GNSS",
    icon: Navigation,
    category: "gnss",
  },
  [SensorType.Collision]: {
    component: CollisionLog,
    displayName: "Collision Detector",
    icon: AlertTriangle,
    category: "event",
  },
  [SensorType.LaneInvasion]: {
    component: LaneInvasionLog,
    displayName: "Lane Invasion",
    icon: ArrowLeftRight,
    category: "event",
  },
  [SensorType.Obstacle]: {
    component: CollisionLog,
    displayName: "Obstacle Detector",
    icon: CircleAlert,
    category: "event",
  },
};

export function getSensorDisplayName(typeId: string): string {
  return SENSOR_REGISTRY[typeId]?.displayName ?? typeId.split(".").pop() ?? typeId;
}
