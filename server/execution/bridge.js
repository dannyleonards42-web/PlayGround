import { ExecutionError } from '../lib/errors.js';

export function createExecutionBridge({ providers }) {
  const registry = new Map(Object.entries(providers));
  return {
    list() {
      return [...registry.values()].map((provider) => ({ id: provider.id, name: provider.name }));
    },
    async execute(task, context) {
      const provider = registry.get(task.type);
      if (!provider) {
        throw new ExecutionError('NO_PROVIDER', `No execution provider is registered for “${task.type}”.`, {
          recoverable: false
        });
      }
      return provider.execute(task, context);
    }
  };
}
