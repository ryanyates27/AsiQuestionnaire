// src/components/QuestionCard.jsx
import React from 'react';

export default function QuestionCard({ item, onEdit, onDelete, isEditing, editProps }) {
  return (
    <div style={{
      backgroundColor: '#f9f9f9',
      padding: '1rem',
      marginBottom: '1rem',
      borderRadius: '8px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
    }}>
      {isEditing ? (
        editProps
      ) : (
        <>
          <p><strong>Q:</strong> {item.question}</p>
          <p><strong>A:</strong> {item.answer}</p>
          <p style={{ fontStyle: 'italic' }}>
            Tag: {item.tag} → {item.innertag}
          </p>
          <button onClick={() => onEdit(item)} style={{ marginRight: '0.5rem' }}>Edit</button>
          <button onClick={() => onDelete(item.id)}>Delete</button>
        </>
      )}
    </div>
  );
}
