import settings from "../../data/robot_actions.json";
export const actionSettings = settings;
export function actionStage(kind: "harvest" | "reveal", progress: number) {
  const stages = settings[kind].stages;
  let index = 0;
  stages.forEach((stage, i) => {
    if (progress >= stage.start) index = i;
  });
  return { ...stages[index], index };
}
export const HARVEST = {
  detach: 0.46,
  lift: 0.53,
  release: 0.75,
  landed: 0.86,
};
