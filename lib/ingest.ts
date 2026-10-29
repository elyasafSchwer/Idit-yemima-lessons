import { supabase } from '@/lib/supabase';

export type TrackKind = 'full' | 'summary';

// Hands a lesson's raw recordings to the GitHub Actions pipeline. On failure
// the ingest-dispatch function has already marked the job failed, so callers
// only need to tell Idit.
export async function dispatchIngest(lessonId: string, kind: TrackKind) {
  const { error } = await supabase.functions.invoke('ingest-dispatch', {
    body: { lessonId, kind },
  });
  return { error };
}

// Re-runs a failed job on the recordings already in `incoming`. The job goes
// back to processing first, because both the dispatch function and the
// workflow only update rows in that state. A lesson whose main recording never
// went live does too; a summary retry leaves the lesson's visibility alone.
export async function retryIngest(jobId: string, lessonId: string, kind: TrackKind) {
  const { error: jobErr } = await supabase
    .from('ingest_jobs')
    .update({ status: 'processing', error: null, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (jobErr) return { error: jobErr };
  if (kind === 'full') {
    const { error: lessonErr } = await supabase
      .from('lessons')
      .update({ status: 'processing' })
      .eq('id', lessonId)
      .eq('status', 'failed');
    if (lessonErr) return { error: lessonErr };
  }
  return dispatchIngest(lessonId, kind);
}
