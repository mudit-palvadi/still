/**
 * MoveNet does not use MediaPipe's BlazePose runtime, but the pose-detection
 * package imports `@mediapipe/pose` at module scope. The published MediaPipe
 * file is a UMD bundle without an ESM `Pose` export, which breaks Rolldown.
 * STILL only uses MoveNet, so this inert stand-in is enough to let the bundle
 * resolve. BlazePose's MediaPipe runtime is intentionally unsupported here.
 */
export class Pose {
  constructor(_options?: unknown) {
    throw new Error('The MediaPipe BlazePose runtime is not bundled with STILL.');
  }
}
