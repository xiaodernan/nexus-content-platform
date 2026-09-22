import { policyCheckpoint, type Checkpoint, type CheckpointPolicy, type CheckpointRequest } from '@nexus/agent-runtime';

/**
 * M2 v41 — the dock's §28 face becomes a CHOICE of two honest modes. `human` is exactly
 * today's behavior (the visitor clicks Allow-once per action); `policy` is the v40
 * runtime table speaking on the human's behalf — pre-authored, reason-carrying,
 * receipted. Whichever face gates a call, the verdict lands in `verdicts` so the ledger
 * line can say WHO decided and WHY. A policy is only as trusted as the human who wrote
 * it; nothing here pretends otherwise (§60).
 */
export interface GateVerdict {
  tool: string;
  granted: boolean;
  by: 'human' | 'policy';
  reason: string;
}

export type DockFace =
  | { mode: 'human'; decide: (req: CheckpointRequest) => boolean | Promise<boolean> }
  | { mode: 'policy'; policy: CheckpointPolicy };

export interface GatedFace {
  checkpoint: Checkpoint;
  verdicts: GateVerdict[];
}

/** Adapt either face into the registry's unchanged Checkpoint, recording every verdict. */
export function faceCheckpoint(face: DockFace): GatedFace {
  const verdicts: GateVerdict[] = [];
  if (face.mode === 'policy') {
    const cp = policyCheckpoint(face.policy); // validates at construction — a bad table never gates
    return {
      checkpoint: async (req) => {
        const granted = await cp(req);
        const receipt = cp.decisions.at(-1)!;
        verdicts.push({ tool: req.call.tool, granted, by: 'policy', reason: `rule ${receipt.matched}: ${receipt.reason}` });
        return granted;
      },
      verdicts,
    };
  }
  return {
    checkpoint: async (req) => {
      const granted = await face.decide(req);
      verdicts.push({ tool: req.call.tool, granted, by: 'human', reason: granted ? 'human approved' : 'human denied' });
      return granted;
    },
    verdicts,
  };
}

/** One inspectable line for the ledger: who spoke, and what each call got. */
export function gateLineFor(verdicts: GateVerdict[]): string {
  if (verdicts.length === 0) return 'no gated calls';
  const first = verdicts[0]!.by;
  const by = verdicts.every((v) => v.by === first) ? first : 'mixed';
  return `${by}: ${verdicts.map((v) => `${v.tool} ${v.granted ? 'granted' : 'VETO'}`).join(' · ')}`;
}
