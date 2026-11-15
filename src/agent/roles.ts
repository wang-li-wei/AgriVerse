import type { Role } from "../types";
export const roles: Record<
  Role,
  {
    name: string;
    short: string;
    english: string;
    subtitle: string;
    greeting: string;
    prompt: string;
    quick: string[];
  }
> = {
  farmer: {
    name: "生产助手",
    short: "农户",
    english: "FARM ASSISTANT",
    subtitle: "把每一次观察，变成更好的收获。",
    greeting:
      "你好，我是你的生产助手。\n我已准备好与您一起巡检这座番茄温室。可以先看看果实的成熟情况，再制定今天的模拟采摘计划。",
    prompt: "帮我检查哪些番茄成熟了，模拟采摘。",
    quick: ["今日巡检与采摘", "查看温室环境", "生成管理报告"],
  },
  student: {
    name: "研学导师",
    short: "研学学生",
    english: "LEARNING COMPANION",
    subtitle: "从一片叶子开始，探索农业的奥秘。",
    greeting:
      "欢迎来到番茄温室！\n我们一起认识植物、观察果实，再试着操作机械臂。准备好成为今天的小小农业探索家了吗？",
    prompt: "带我认识这株番茄，然后让我体验一次机器人采摘。",
    quick: ["开始研学挑战", "认识叶片与茎秆", "了解温室环境"],
  },
  expert: {
    name: "远程会诊助手",
    short: "农业专家",
    english: "EXPERT COPILOT",
    subtitle: "让观察更充分，让判断更有依据。",
    greeting:
      "欢迎进入远程会诊。\nP01 存在一处预置的模拟叶片异常，当前有叶片遮挡。我可以辅助拨叶观察，并整理环境与巡检记录供您核实。",
    prompt: "帮我查看P01的疑似病害区域，并调取最近几天的环境信息。",
    quick: ["观察 P01 模拟异常", "查询环境历史", "查看会诊摘要"],
  },
};
