import { ExecutionError } from '../lib/errors.js';
import { newId, nowIso } from '../lib/ids.js';

/**
 * Prepares a human-reviewable outreach draft. It never resolves an email,
 * never sends a message and never changes an external account.
 */
export function createOutreachProvider({ store, now = nowIso }) {
  return {
    id: 'nova-outreach-draft',
    name: 'NOVA Outreach Draft',
    async execute(task) {
      const source = store.getTask(task.input.researchTaskId);
      if (!source) {
        throw new ExecutionError('SOURCE_TASK_NOT_FOUND', 'The research task for this draft no longer exists.', {
          status: 404,
          recoverable: false
        });
      }
      if (source.status !== 'COMPLETED' || !source.results?.prospects?.length) {
        throw new ExecutionError(
          'SOURCE_NOT_COMPLETE',
          'Outreach can only be drafted from a completed research task with delivered results.',
          { recoverable: true }
        );
      }
      const prospect = source.results.prospects.find((entry) => entry.id === task.input.prospectId);
      if (!prospect) {
        throw new ExecutionError('PROSPECT_NOT_FOUND', 'That prospect is not part of the selected research task.', {
          status: 404,
          recoverable: false
        });
      }

      const topSignal = prospect.opportunity?.signals?.[0];
      const signalFact = topSignal
        ? prospect.facts.find((fact) => fact.id === topSignal.factId)
        : null;
      const observation = signalFact?.statement ?? 'The homepage is live and identifiable.';
      const website = prospect.website?.finalUrl ?? prospect.website?.url;
      const createdAt = now();

      const subject = `A quick website observation for ${prospect.name}`;
      const body = [
        `Hi ${prospect.name} team,`,
        '',
        `I am with DEEMANNIE'S DIGITAL. I reviewed ${website ?? 'your public listing'} on ${createdAt.slice(0, 10)} and recorded one specific observation:`,
        '',
        `“${observation}”`,
        '',
        topSignal
          ? `That came from a static review of the homepage. It may be worth a closer look, especially if ${topSignal.label.toLowerCase()} is affecting how customers find or contact you.`
          : 'I did not find a material static-HTML gap, so a deeper analytics review would be the useful next step.',
        '',
        'I can prepare a short, no-obligation teardown with the exact evidence and a suggested fix. If this is not relevant, no follow-up is needed.',
        '',
        'Regards,',
        "DEEMANNIE'S DIGITAL — Research Desk"
      ].join('\n');

      const approvalId = newId('apr');
      return {
        requiresApproval: true,
        data: {
          draft: {
            id: newId('drf'),
            prospectId: prospect.id,
            prospectName: prospect.name,
            recipient: 'Not verified — manual lookup required',
            subject,
            body,
            createdAt
          },
          provenance: {
            researchTaskId: source.id,
            prospectId: prospect.id,
            evidenceFactId: signalFact?.id ?? null,
            evidence: signalFact
              ? { statement: signalFact.statement, source: signalFact.source, observedAt: signalFact.observedAt }
              : null
          },
          sendStatus: 'NOT_SENT',
          notice:
            'AGENT HQ never sends email. Approval only releases this draft for a human to review and send manually.'
        },
        approval: {
          id: approvalId,
          taskId: task.id,
          researchTaskId: source.id,
          prospectId: prospect.id,
          prospectName: prospect.name,
          subject,
          body,
          recipient: 'Not verified — manual lookup required',
          status: 'AWAITING_APPROVAL',
          createdAt,
          decision: null,
          sendStatus: 'NOT_SENT',
          notice:
            'Approval records intent only. No message is sent, no account is changed, and no money is spent by AGENT HQ.'
        }
      };
    }
  };
}
