import { Question } from "../types";
import { demoQuestions } from "./demoQuestions";

export { demoQuestions };

export const aiQuestions: Question[] = [];

// 文化祭展示用デモ版：実際の過去問データは同梱していません。
export const initialQuestions: Question[] = [...demoQuestions, ...aiQuestions];
