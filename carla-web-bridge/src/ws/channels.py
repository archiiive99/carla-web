"""WebSocket binary protocol channel definitions."""


class Channel:
    # Sensor data channels
    CAMERA = 0x01
    DEPTH = 0x02
    SEGMENTATION = 0x03
    LIDAR = 0x04
    SEMANTIC_LIDAR = 0x05
    RADAR = 0x06
    IMU = 0x07
    GNSS = 0x08
    COLLISION = 0x09
    LANE_INVASION = 0x0A
    DVS = 0x0B

    # World data
    WORLD_TICK = 0x10
    TELEMETRY = 0x11

    # Control channels (text JSON)
    SUBSCRIBE = 0xF0
    UNSUBSCRIBE = 0xF1
    CLIENT_STATS = 0xFE
    CONTROL = 0xFF


CHANNEL_NAMES = {
    Channel.CAMERA: "camera",
    Channel.DEPTH: "depth",
    Channel.SEGMENTATION: "segmentation",
    Channel.LIDAR: "lidar",
    Channel.SEMANTIC_LIDAR: "semantic_lidar",
    Channel.RADAR: "radar",
    Channel.IMU: "imu",
    Channel.GNSS: "gnss",
    Channel.COLLISION: "collision",
    Channel.LANE_INVASION: "lane_invasion",
    Channel.DVS: "dvs",
    Channel.WORLD_TICK: "world_tick",
    Channel.TELEMETRY: "telemetry",
    Channel.SUBSCRIBE: "subscribe",
    Channel.UNSUBSCRIBE: "unsubscribe",
    Channel.CLIENT_STATS: "client_stats",
    Channel.CONTROL: "control",
}
