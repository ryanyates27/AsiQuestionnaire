// src/components/QuestionForm.jsx
import React from 'react';

const innerTagOptions = {
  Database: ['Logs','Transfers','Backups'],
  Business: ['Assessment','Employee','Procedures','Security'],
  Software: ['Patches','Logs','Access','Connectivity'],
  System:   ['Security','Design','Logs','Users']
};

export default function QuestionForm({ values, onChange, onSubmit, submitLabel }) {
  return (
    <form onSubmit={onSubmit} style={{ maxWidth: '600px' }}>
      <div style={{ marginBottom: '1rem' }}>
        <label><strong>Question:</strong><br/>
          <textarea
            required
            value={values.question}
            onChange={e => onChange('question', e.target.value)}
            style={{ width:'100%', height:'60px' }}
          />
        </label>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label><strong>Answer:</strong><br/>
          <textarea
            required
            value={values.answer}
            onChange={e => onChange('answer', e.target.value)}
            style={{ width:'100%', height:'60px' }}
          />
        </label>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label><strong>Tag:</strong><br/>
          <select
            value={values.tag}
            onChange={e => {
              onChange('tag', e.target.value);
              onChange('innertag', innerTagOptions[e.target.value][0]);
            }}
          >
            {Object.keys(innerTagOptions).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label><strong>Inner Tag:</strong><br/>
          <select
            value={values.innertag}
            onChange={e => onChange('innertag', e.target.value)}
          >
            {innerTagOptions[values.tag].map(it => (
              <option key={it} value={it}>{it}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
