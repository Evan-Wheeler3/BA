import type { RecallPrompt } from '../domain/types'
import { currentSession } from './sync'
import { supabase } from './supabase'

export interface AiGrade {
  rubric: 0 | 1 | 2 | 3 | 4
  correctPoints: string[]
  missingPoints: string[]
  feedback: string
}

export function aiGradingAvailable(): boolean {
  return !!supabase() && !!currentSession()
}

/**
 * Optional AI grading via the server-side `grade-recall` Supabase Edge Function.
 * The API key lives only in the function's secrets. Returns null on any failure so
 * the caller falls back to deterministic keyword grading.
 */
export async function aiGradeRecall(prompt: RecallPrompt, answer: string): Promise<AiGrade | null> {
  const sb = supabase()
  if (!sb || !currentSession()) return null
  try {
    const { data, error } = await sb.functions.invoke('grade-recall', {
      body: {
        question: prompt.prompt,
        keyPoints: prompt.keyPoints.map((k) => k.label),
        modelAnswer: prompt.modelAnswer,
        answer: answer.slice(0, 2000),
      },
    })
    if (error || !data || typeof data.rubric !== 'number') return null
    const rubric = Math.max(0, Math.min(4, Math.round(data.rubric))) as AiGrade['rubric']
    return {
      rubric,
      correctPoints: Array.isArray(data.correctPoints) ? data.correctPoints.slice(0, 8).map(String) : [],
      missingPoints: Array.isArray(data.missingPoints) ? data.missingPoints.slice(0, 8).map(String) : [],
      feedback: typeof data.feedback === 'string' ? data.feedback.slice(0, 600) : '',
    }
  } catch {
    return null
  }
}
