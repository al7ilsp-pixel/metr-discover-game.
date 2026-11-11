import type { Lang } from './backend/types';

/**
 * Display content for the four activities. Correct answers are NOT stored
 * here – the server reveals them only after each activity closes.
 */
type L = Record<Lang, string>;

export interface ChoiceActivity {
  kind: 'choice';
  questionId: string;
  title: L;
  topic: L;
  scenario: L[];
  question: L;
  options: { value: string; label: L }[];
  explanation: L;
}
export interface WhatIfActivity {
  kind: 'whatif';
  questionId: string;
  title: L;
  topic: L;
  scenario: L[];
  explanation: L;
}
export interface ClassifyActivity {
  kind: 'classify';
  title: L;
  topic: L;
  scenario: L[];
  items: { questionId: string; text: L }[];
  explanation: L;
}
export type Activity = ChoiceActivity | WhatIfActivity | ClassifyActivity;

export const DURATIONS = [45, 60, 90, 60];
export const ORIGINAL_PRICE = 800_000;
export const PRICE_MIN = 500_000;
export const PRICE_MAX = 1_200_000;

export const ACTIVITIES: Activity[] = [
  {
    kind: 'choice',
    questionId: 'a1q1',
    title: { en: 'Can You Spot the Problem?', ar: 'هل تستطيع اكتشاف المشكلة؟' },
    topic: { en: 'Data fragmentation', ar: 'تشتت البيانات' },
    scenario: [
      { en: 'You manage a small real estate company.', ar: 'أنت تدير شركة عقارية صغيرة.' },
      {
        en: 'Property information, transaction records, rental prices and market data sit in different Excel files and reports — with no unified view.',
        ar: 'معلومات العقارات وسجلات الصفقات وأسعار الإيجار وبيانات السوق موزعة على ملفات Excel وتقارير مختلفة — دون رؤية موحّدة.',
      },
    ],
    question: { en: 'What is the biggest challenge?', ar: 'ما التحدي الأكبر؟' },
    options: [
      { value: 'A', label: { en: 'Too many employees', ar: 'كثرة عدد الموظفين' } },
      { value: 'B', label: { en: 'Scattered data and limited analytical visibility', ar: 'تشتت البيانات وضعف الرؤية التحليلية' } },
      { value: 'C', label: { en: 'Too many properties', ar: 'كثرة عدد العقارات' } },
      { value: 'D', label: { en: 'Lack of office space', ar: 'ضيق مساحة المكتب' } },
    ],
    explanation: {
      en: 'Scattered data makes it difficult to understand performance and make informed decisions.',
      ar: 'تشتت البيانات يجعل فهم الأداء واتخاذ القرارات المبنية على المعلومات أكثر صعوبة.',
    },
  },
  {
    kind: 'choice',
    questionId: 'a2q1',
    title: { en: 'What Would You Do?', ar: 'ماذا ستفعل؟' },
    topic: { en: 'Data-driven decision making', ar: 'اتخاذ القرار المبني على البيانات' },
    scenario: [
      {
        en: 'A real estate office notices that property demand in one neighborhood has dropped by 20%.',
        ar: 'لاحظ مكتب عقاري أن الطلب على العقارات في أحد الأحياء انخفض بنسبة 20٪.',
      },
    ],
    question: { en: 'What should the manager do first?', ar: 'ما أول ما يجب أن يفعله المدير؟' },
    options: [
      { value: 'A', label: { en: 'Reduce all property prices immediately', ar: 'تخفيض أسعار جميع العقارات فوراً' } },
      { value: 'B', label: { en: 'Analyze neighborhood data and demand indicators', ar: 'تحليل بيانات الحي ومؤشرات الطلب' } },
      { value: 'C', label: { en: 'Ignore the decline', ar: 'تجاهل الانخفاض' } },
      { value: 'D', label: { en: 'Decide based only on personal assumptions', ar: 'اتخاذ القرار بناءً على الافتراضات الشخصية فقط' } },
    ],
    explanation: {
      en: 'Smart decisions start with understanding the data.',
      ar: 'القرارات الذكية تبدأ بفهم البيانات.',
    },
  },
  {
    kind: 'whatif',
    questionId: 'a3q1',
    title: { en: 'What If You Changed the Price?', ar: 'ماذا لو غيّرت السعر؟' },
    topic: { en: 'Scenario analysis', ar: 'تحليل السيناريوهات' },
    scenario: [
      {
        en: 'A property is listed at SAR 800,000. Move the sliders to test a pricing scenario.',
        ar: 'عقار معروض بسعر 800,000 ريال. حرّك المؤشرات لاختبار سيناريو للتسعير.',
      },
    ],
    explanation: {
      en: 'This is What-If Analysis: testing possible scenarios before making a decision.',
      ar: 'هذا هو تحليل السيناريوهات: اختبار الاحتمالات قبل اتخاذ القرار.',
    },
  },
  {
    kind: 'classify',
    title: { en: 'Safe or Risky?', ar: 'آمن أم يشكل خطراً؟' },
    topic: { en: 'Responsible AI and data governance', ar: 'الذكاء الاصطناعي المسؤول وحوكمة البيانات' },
    scenario: [],
    items: [
      {
        questionId: 'a4q1',
        text: {
          en: "Entering a customer's national ID into a public AI tool.",
          ar: 'إدخال رقم الهوية الوطنية لعميل في أداة ذكاء اصطناعي عامة.',
        },
      },
      {
        questionId: 'a4q2',
        text: {
          en: 'Using non-sensitive, anonymized real estate data to analyze market trends.',
          ar: 'استخدام بيانات عقارية غير حساسة ومجهولة الهوية لتحليل اتجاهات السوق.',
        },
      },
    ],
    explanation: {
      en: 'AI can support decisions, but sensitive data must be protected and AI outputs require appropriate human review.',
      ar: 'يمكن للذكاء الاصطناعي دعم القرارات، لكن يجب حماية البيانات الحساسة ومراجعة مخرجات الذكاء الاصطناعي بشرياً.',
    },
  },
];

/** Extra nuance shown next to the "Safe" key for scenario 2. */
export const SAFE_NOTE: L = {
  en: 'Generally safe — subject to applicable policies and safeguards.',
  ar: 'آمن غالباً — مع الالتزام بالسياسات والضوابط المعمول بها.',
};

export const questionIdsOf = (a: Activity) => (a.kind === 'classify' ? a.items.map((i) => i.questionId) : [a.questionId]);
