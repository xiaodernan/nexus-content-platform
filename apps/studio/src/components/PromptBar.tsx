'use client';
import { useState } from 'react';
import { useStudio } from '@/lib/store';

const SUGGESTIONS = ['a SaaS landing page', 'a login screen', 'an analytics dashboard', 'a portfolio site'];
const EDIT_HINTS = ['bigger', 'hide', 'recolor brand', 'rename Hero'];

export default function PromptBar() {
  const generate = useStudio((s) => s.generate);
  const editSelection = useStudio((s) => s.editSelection);
  const aiBusy = useStudio((s) => s.aiBusy);
  const mode = useStudio((s) => s.mode);
  const [tab, setTab] = useState<'generate' | 'edit'>('generate');
  const [prompt, setPrompt] = useState('');
  const [instruction, setInstruction] = useState('');

  const runGenerate = () => {
    if (!prompt.trim()) return;
    void generate(prompt);
  };
  const runEdit = () => {
    if (!instruction.trim()) return;
    void editSelection(instruction);
    setInstruction('');
  };

  return (
    <div className="panel" style={{ borderLeft: 'none', borderRight: 'none', borderBottom: 'none', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ display: 'flex', background: '#0f1420', borderRadius: 8, padding: 2, border: '1px solid var(--nexus-border)' }}>
          <button className={`btn ${tab === 'generate' ? 'tool-active' : ''}`} style={{ border: 'none', background: 'transparent' }} onClick={() => setTab('generate')}>Generate</button>
          <button className={`btn ${tab === 'edit' ? 'tool-active' : ''}`} style={{ border: 'none', background: 'transparent' }} onClick={() => setTab('edit')}>AI Edit</button>
        </div>
        <span style={{ fontSize: 11, color: 'var(--nexus-muted)' }}>
          {tab === 'generate' ? 'Describe a section to compose onto the canvas.' : 'Apply a deterministic transform to the selected layer(s).'}
        </span>
        <div style={{ flex: 1 }} />
        {mode === 'demo' && <span style={{ fontSize: 10, color: '#ffd24a' }}>deterministic output · no keys</span>}
      </div>

      {tab === 'generate' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="field"
            placeholder={mode === 'demo' ? 'e.g. an analytics dashboard  (DEMO MODE)' : 'Describe what to build…'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runGenerate()}
            disabled={aiBusy}
          />
          <button className="btn btn-primary" onClick={runGenerate} disabled={aiBusy} style={{ whiteSpace: 'nowrap' }}>
            {aiBusy ? 'Composing…' : 'Compose'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="field"
            placeholder="e.g. bigger, hide, recolor brand, rename Hero"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runEdit()}
            disabled={aiBusy}
          />
          <button className="btn btn-primary" onClick={runEdit} disabled={aiBusy} style={{ whiteSpace: 'nowrap' }}>
            {aiBusy ? 'Applying…' : 'Apply edit'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(tab === 'generate' ? SUGGESTIONS : EDIT_HINTS).map((chip) => (
          <button
            key={chip}
            className="btn"
            style={{ fontSize: 11, padding: '2px 8px', background: '#0f1420' }}
            onClick={() => {
              if (tab === 'generate') {
                setPrompt(chip);
                void generate(chip);
              } else {
                void editSelection(chip);
              }
            }}
            disabled={aiBusy}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
