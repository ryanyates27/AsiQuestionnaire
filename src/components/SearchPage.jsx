// src/components/SearchPage.jsx
import React, { useEffect, useState } from 'react';
import PageWrapper from './PageWrapper';

export default function SearchPage({ onBack }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showSites, setShowSites] = useState(false);
  const [showTypes, setShowTypes] = useState(true);
  const [infoModal, setInfoModal] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await window.api.getQuestions(query);
        setResults(data);
      } catch (err) {
        console.error('Error fetching questions:', err);
      }
    })();
  }, [query]);

  const grouped = results.reduce((acc, item) => {
    const main = item.tag;
    const sub  = item.subtag || 'Unspecified';
    if (!acc[main]) acc[main] = {};
    if (!acc[main][sub]) acc[main][sub] = [];
    acc[main][sub].push(item);
    return acc;
  }, {});

  // exact splits
  const widths = showSites
    ? { q: '40%', a: '45%', i: '5%',  s: '10%' }
    : { q: '45%', a: '45%', i: '10%'     };

  return (
    <PageWrapper onBack={onBack} title="Search Questions">
      {/* Search + toggles */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search questions..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flexGrow: 1, padding: 8, fontSize: 16, border: '1px solid #ccc', borderRadius: 4 }}
        />
        <div style={{ marginLeft: 16, color: '#000' }}>
          <label><input type="checkbox" checked={showSites} onChange={() => setShowSites(s => !s)} style={{ marginRight: 4 }} />Sites</label>
          <label style={{ display:'block' }}><input type="checkbox" checked={showTypes} onChange={() => setShowTypes(t => !t)} style={{ marginRight: 4 }} />Types</label>
        </div>
      </div>

      {/* Fixed‐layout table with colgroup */}
      <table
        style={{
          width: '100%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          backgroundColor: '#fff',
          color: '#000'
        }}
      >
        <colgroup>
          <col style={{ width: widths.q }} />
          <col style={{ width: widths.a }} />
          <col style={{ width: widths.i }} />
          {showSites && <col style={{ width: widths.s }} />}
        </colgroup>

        {Object.entries(grouped).map(([type, subs]) => (
          <tbody key={type}>
            {/* Main type header */}
            <tr>
              <td
                colSpan={showSites ? 4 : 3}
                style={{ backgroundColor: '#000', color: '#fff', padding: 8, fontSize: 18 }}
              >
                {type}
              </td>
            </tr>

            {showTypes
              ? Object.entries(subs).map(([sub, items]) => (
                  <React.Fragment key={sub}>
                    {/* Subtype header */}
                    <tr>
                      <td
                        colSpan={showSites ? 4 : 3}
                        style={{ backgroundColor: '#ccc', padding: 6, fontWeight: 'bold' }}
                      >
                        {sub}
                      </td>
                    </tr>
                    {/* Question rows */}
                    {items.map(item => (
                      <tr key={item.id}>
                        <td style={{ border: '1px solid #000', padding: 6 }}>{item.question}</td>
                        <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>{item.answer}</td>
                        <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>
                          {item.additionalInfo && (
                            <button
                              onClick={() => setInfoModal(item.additionalInfo)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
                            >
                              ℹ️
                            </button>
                          )}
                        </td>
                        {showSites && (
                          <td style={{ border: '1px solid #000', padding: 6 }}>{item.siteName || '—'}</td>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              : /* flat list if types off */
                Object.values(subs)
                  .flat()
                  .map(item => (
                    <tr key={item.id}>
                      <td style={{ border: '1px solid #000', padding: 6 }}>{item.question}</td>
                      <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>{item.answer}</td>
                      <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>
                        {item.additionalInfo && (
                          <button
                            onClick={() => setInfoModal(item.additionalInfo)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
                          >
                            ℹ️
                          </button>
                        )}
                      </td>
                      {showSites && <td style={{ border: '1px solid #000', padding: 6 }}>{item.siteName || '—'}</td>}
                    </tr>
                  ))}
          </tbody>
        ))}
      </table>

      {/* Modal */}
      {infoModal && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              color: '#000',
              paddingTop: '0',
              paddingLeft: '1rem',
              paddingRight: '0',
              paddingBottom: '1rem',
              borderRadius: 8,
              maxWidth: '80%',
              maxHeight: '70%',
              overflow: 'auto'
            }}
          >
            <button
              onClick={() => setInfoModal(null)}
              style={{ float: 'right', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              ✖
            </button>
            <h3>Additional Information</h3>
            <p>{infoModal}</p>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
