import { extractSchemaRequirements } from './schema-requirements';

describe('schema-requirements', () => {
  it('extracts x-ui-required-when rules using present conditions', () => {
    const requirements = extractSchemaRequirements({
      type: 'object',
      properties: {
        feedbackInput: {
          type: 'string'
        },
        feedbackPrompt: {
          type: 'object',
          properties: {
            title: {
              type: 'string'
            }
          }
        },
        followUpQuestion: {
          type: 'string',
          'x-ui-required-when': {
            field: 'feedbackInput',
            present: true
          }
        },
        followUpSummary: {
          type: 'string',
          'x-ui-required-when': {
            field: 'feedbackPrompt',
            present: true
          }
        }
      }
    });

    expect(requirements.conditional).toEqual([
      expect.objectContaining({
        path: 'followUpQuestion',
        requiredWhen: {
          field: 'feedbackInput',
          present: true
        }
      }),
      expect.objectContaining({
        path: 'followUpSummary',
        requiredWhen: {
          field: 'feedbackPrompt',
          present: true
        }
      })
    ]);
  });
});
