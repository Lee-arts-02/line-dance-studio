/**
 * On-body action labels are rendered on the skeleton canvas (mirrored video + unmirrored canvas),
 * not as React DOM. Import these helpers where the canvas is drawn.
 *
 * @see CameraStage
 * @see CustomActionTrainer
 */
export {
  drawTorsoActionLabels,
  buildMainStageTorsoLines,
  buildTrainerTorsoLines,
  formatCustomClassBodyLabel,
  shouldShowCustomOnMainStageBody,
  TORSO_ACTION_LABEL_LINE_GAP_PX,
  type TorsoLabelLine,
  type CustomBodyPrediction,
} from "@/lib/pose/bodyActionLabels";
