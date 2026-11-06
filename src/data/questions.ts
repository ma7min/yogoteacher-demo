import { Question } from "../types";
import { demoQuestions } from "./demoQuestions";
import { pastQuestions } from "./pastQuestions";
import { expectedQuestionsDemo } from "./expectedQuestionsDemo";

export { demoQuestions, pastQuestions };

export const aiQuestions: Question[] = [];

// 文化祭展示用デモ版：実際の過去問は各都道府県から少数のみ収録しています。
export const initialQuestions: Question[] = [...pastQuestions, ...expectedQuestionsDemo, ...aiQuestions];
