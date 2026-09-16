export type CapabilityState = 'supported' | 'unsupported' | 'unknown';

// Bentuk record lengkap ditetapkan pada Phase 1 bersama zod schema GET /models.
export type ModelRecord = {
  id: string;
  capability: CapabilityState;
};
