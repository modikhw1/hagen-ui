'use client';

import { useState, useRef, useEffect } from 'react';

interface GamePlanNote {
  type: 'text' | 'heading' | 'link';
  content?: string;
  label?: string;
  url?: string;
  linkType?: string;
}

interface RichTextEditorProps {
  notes: GamePlanNote[];
  onChange: (notes: GamePlanNote[]) => void;
  isFullscreen?: boolean;
}

export function RichTextEditor({ notes, onChange, isFullscreen = false }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkType, setLinkType] = useState('tiktok');
  const [isExpanded, setIsExpanded] = useState(isFullscreen);
  const lastBoldState = useRef<boolean | null>(null);

  const insertText = (text: string, wantsBold: boolean = false) => {
    if (!editorRef.current) return;
    
    const selection = window.getSelection();
    
    if (wantsBold) {
      lastBoldState.current = null;
    }
    
    if (selection && selection.rangeCount > 0 && selection.toString().length > 0) {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString();
      
      let isCurrentlyBold = lastBoldState.current;
      
      if (isCurrentlyBold === null) {
        let node = range.commonAncestorContainer;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            const weight = el.style.fontWeight || window.getComputedStyle(el).fontWeight;
            if (weight) {
              isCurrentlyBold = parseInt(weight) >= 700;
              break;
            }
          }
          node = node.parentNode!;
        }
      }
      
      const shouldBeBold = !isCurrentlyBold || !wantsBold;
      
      if (shouldBeBold) {
        const span = document.createElement('span');
        span.style.fontWeight = '700';
        span.style.fontSize = '16px';
        span.style.color = '#1a1a2e';
        span.style.marginBottom = '8px';
        span.style.display = 'block';
        span.textContent = selectedText;
        range.deleteContents();
        range.insertNode(span);
        lastBoldState.current = true;
      } else {
        const span = document.createElement('span');
        span.style.fontWeight = '400';
        span.style.fontSize = '14px';
        span.style.color = '#4b5563';
        span.style.marginBottom = '4px';
        span.style.display = 'block';
        span.textContent = selectedText;
        range.deleteContents();
        range.insertNode(span);
        lastBoldState.current = false;
      }
      
      selection.removeAllRanges();
      onChange(getNotesFromEditor());
      return;
    } else if (selection && selection.anchorNode && editorRef.current) {
      const range = document.createRange();
      range.setStart(editorRef.current, editorRef.current.childNodes.length);
      range.collapse(true);
      
      const span = document.createElement('div');
      span.style.fontWeight = wantsBold ? '700' : '400';
      span.style.fontSize = wantsBold ? '16px' : '14px';
      span.style.color = wantsBold ? '#1a1a2e' : '#4b5563';
      span.style.marginBottom = wantsBold ? '8px' : '4px';
      span.textContent = text || 'Ny text...';
      
      editorRef.current.appendChild(span);
      
      range.setStartAfter(span);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else if (editorRef.current) {
      const span = document.createElement('div');
      span.style.fontWeight = wantsBold ? '700' : '400';
      span.style.fontSize = wantsBold ? '16px' : '14px';
      span.style.color = wantsBold ? '#1a1a2e' : '#4b5563';
      span.style.marginBottom = wantsBold ? '8px' : '4px';
      span.textContent = text || 'Ny text...';
      
      editorRef.current.appendChild(span);
    }
    
    onChange(getNotesFromEditor());
  };

  const insertLink = () => {
    if (!linkUrl || !editorRef.current) return;
    
    const icon = linkType === 'tiktok' ? '🎵' : 
                 linkType === 'instagram' ? '📸' : 
                 linkType === 'youtube' ? '▶️' : 
                 linkType === 'article' ? '📄' : '🔗';
    
    const link = document.createElement('a');
    link.href = linkUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('data-type', linkType);
    link.style.color = '#4f46e5';
    link.style.textDecoration = 'underline';
    link.style.marginRight = '8px';
    link.style.marginBottom = '8px';
    link.style.display = 'inline-block';
    link.innerHTML = `${icon} ${linkLabel || linkUrl}`;
    
    editorRef.current.appendChild(link);
    
    const br = document.createElement('div');
    br.style.height = '8px';
    editorRef.current.appendChild(br);
    
    setShowLinkModal(false);
    setLinkUrl('');
    setLinkLabel('');
    setLinkType('tiktok');
    
    onChange(getNotesFromEditor());
  };

  const insertList = () => {
    if (!editorRef.current) return;
    
    const selection = window.getSelection();
    
    if (selection && selection.rangeCount > 0 && selection.toString().length > 0) {
      const selectedText = selection.toString();
      const lines = selectedText.split('\n');
      const range = selection.getRangeAt(0);
      const fragment = document.createDocumentFragment();
      
      lines.forEach((line) => {
        if (line.trim()) {
          const bullet = document.createElement('div');
          bullet.style.marginLeft = '16px';
          bullet.style.marginBottom = '4px';
          bullet.style.color = '#4b5563';
          bullet.style.fontSize = '14px';
          bullet.textContent = '• ' + line.trim();
          fragment.appendChild(bullet);
        }
      });
      
      range.deleteContents();
      range.insertNode(fragment);
      
      if (editorRef.current.lastChild) {
        const newRange = document.createRange();
        newRange.setStartAfter(editorRef.current.lastChild);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } else if (selection && selection.anchorNode && editorRef.current) {
      const range = document.createRange();
      const bullet = document.createElement('div');
      bullet.style.marginLeft = '16px';
      bullet.style.marginBottom = '4px';
      bullet.style.color = '#4b5563';
      bullet.style.fontSize = '14px';
      bullet.textContent = '• ';
      
      if (editorRef.current.lastChild) {
        range.setStartAfter(editorRef.current.lastChild);
      } else {
        range.setStart(editorRef.current, 0);
      }
      range.collapse(true);
      range.insertNode(bullet);
      
      const newRange = document.createRange();
      newRange.setStartAfter(bullet);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
    } else if (editorRef.current) {
      const bullet = document.createElement('div');
      bullet.style.marginLeft = '16px';
      bullet.style.marginBottom = '4px';
      bullet.style.color = '#4b5563';
      bullet.style.fontSize = '14px';
      bullet.textContent = '• ';
      
      editorRef.current.appendChild(bullet);
    }
    
    onChange(getNotesFromEditor());
  };

  const getNotesFromEditor = (): GamePlanNote[] => {
    if (!editorRef.current) return notes;
    
    const newNotes: GamePlanNote[] = [];
    const children = editorRef.current.childNodes;
    
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement;
      
      if (el.nodeType === Node.TEXT_NODE && !el.textContent?.trim()) continue;
      if (el.nodeType === Node.TEXT_NODE && el.textContent) {
        newNotes.push({ type: 'text', content: el.textContent });
        continue;
      }
      
      if (!el.tagName) {
        if (el.textContent?.trim()) {
          newNotes.push({ type: 'text', content: el.textContent });
        }
        continue;
      }
      
      if (el.tagName === 'A') {
        newNotes.push({
          type: 'link',
          url: el.href,
          label: el.textContent || '',
          linkType: el.getAttribute('data-type') || 'external'
        });
      } else if (el.tagName === 'SPAN' || el.tagName === 'DIV') {
        const fontWeight = el.style.fontWeight;
        const computedWeight = window.getComputedStyle(el).fontWeight;
        const isBold = fontWeight === '700' || fontWeight === 'bold' || parseInt(computedWeight) >= 700;
        const fontSize = parseInt(el.style.fontSize) || parseInt(window.getComputedStyle(el).fontSize);
        const isHeading = isBold || fontSize >= 16;
        
        if (isHeading) {
          newNotes.push({
            type: 'heading',
            content: el.textContent || ''
          });
        } else if (el.textContent?.startsWith('•')) {
          newNotes.push({
            type: 'text',
            content: el.textContent
          });
        } else if (el.textContent?.trim()) {
          newNotes.push({
            type: 'text',
            content: el.textContent
          });
        }
      }
    }
    
    return newNotes.filter(n => n.content?.trim() || n.url);
  };

  const notesRef = useRef<GamePlanNote[]>([]);
  
  useEffect(() => {
    const notesChanged = JSON.stringify(notes) !== JSON.stringify(notesRef.current);
    if (!editorRef.current || !notesChanged) return;
    
    notesRef.current = notes;
    editorRef.current.innerHTML = '';
    lastBoldState.current = null;
    
    notes.forEach((note) => {
      if (note.type === 'link' && note.url) {
        const icon = note.linkType === 'tiktok' ? '🎵' : 
                     note.linkType === 'instagram' ? '📸' : 
                     note.linkType === 'youtube' ? '▶️' : 
                     note.linkType === 'article' ? '📄' : '🔗';
        
        const link = document.createElement('a');
        link.href = note.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.setAttribute('data-type', note.linkType);
        link.style.color = '#4f46e5';
        link.style.textDecoration = 'underline';
        link.style.marginRight = '8px';
        link.style.marginBottom = '8px';
        link.style.display = 'inline-block';
        link.innerHTML = `${icon} ${note.label || note.url}`;
        editorRef.current!.appendChild(link);
      } else if (note.type === 'heading') {
        const heading = document.createElement('div');
        heading.style.fontWeight = '700';
        heading.style.fontSize = '16px';
        heading.style.color = '#1a1a2e';
        heading.style.marginBottom = '8px';
        heading.style.display = 'block';
        heading.textContent = note.content || '';
        editorRef.current!.appendChild(heading);
      } else if (note.content?.startsWith('•')) {
        const bullet = document.createElement('div');
        bullet.style.marginLeft = '16px';
        bullet.style.marginBottom = '4px';
        bullet.style.color = '#4b5563';
        bullet.style.fontSize = '14px';
        bullet.textContent = note.content;
        editorRef.current!.appendChild(bullet);
      } else {
        const text = document.createElement('div');
        text.style.fontSize = '14px';
        text.style.color = '#4b5563';
        text.style.marginBottom = '4px';
        text.style.display = 'block';
        text.textContent = note.content || '';
        editorRef.current!.appendChild(text);
      }
    });
  }, [notes]);

  const containerStyle: React.CSSProperties = isExpanded ? {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#fff',
    zIndex: 1000,
    padding: '40px',
    overflow: 'auto',
  } : {
    background: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => insertText('', true)}
          style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '14px', minWidth: '40px' }}
          title="Fet text"
        >
          B
        </button>
        
        <button
          type="button"
          onClick={insertList}
          style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '14px' }}
          title="Punktlista"
        >
          •
        </button>
        
        <button
          type="button"
          onClick={() => setShowLinkModal(true)}
          style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '14px' }}
          title="Lägg till länk"
        >
          🔗 Länk
        </button>
        
        {isFullscreen && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '14px' }}
          >
            {isExpanded ? '✕ Stäng' : '⛶ Fullskärm'}
          </button>
        )}
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        style={{
          minHeight: isExpanded ? 'calc(100vh - 200px)' : '200px',
          padding: '16px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          background: '#fff',
          fontSize: '14px',
          lineHeight: 1.6,
          outline: 'none',
        }}
        onBlur={() => onChange(getNotesFromEditor())}
      />

      {showLinkModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Lägg till länk</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Länktyp</label>
              <select value={linkType} onChange={e => setLinkType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <option value="tiktok">🎵 TikTok</option>
                <option value="instagram">📸 Instagram</option>
                <option value="youtube">▶️ YouTube</option>
                <option value="article">📄 Artikel</option>
                <option value="external">🔗 Extern</option>
              </select>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Länktext (valfritt)</label>
              <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Klicka här" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>URL</label>
              <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
            </div>
            
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLinkModal(false)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>Avbryt</button>
              <button onClick={insertLink} disabled={!linkUrl} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#4f46e5', color: '#fff', cursor: linkUrl ? 'pointer' : 'not-allowed' }}>Lägg till</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GamePlanDisplay({ notes, hasChanges = false }: { notes: GamePlanNote[]; hasChanges?: boolean }) {
  return (
    <div style={{ fontSize: '14px', lineHeight: 1.7, position: 'relative' }}>
      {hasChanges && (
        <div 
          title="Nya uppdateringar i Game Plan"
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            width: '12px',
            height: '12px',
            background: '#10b981',
            borderRadius: '50%',
            border: '2px solid #fff',
          }}
        />
      )}
      
      {notes.length === 0 ? (
        <div style={{ color: '#9ca3af' }}>Ingen Game Plan</div>
      ) : (
        notes.map((note, i) => {
          if (note.type === 'heading') {
            return <div key={i} style={{ fontWeight: 700, fontSize: '16px', margin: '16px 0 8px', color: '#1a1a2e', display: 'block' }}>{note.content}</div>;
          }
          if (note.type === 'link' && note.url) {
            const icon = note.linkType === 'tiktok' ? '🎵' : 
                         note.linkType === 'instagram' ? '📸' : 
                         note.linkType === 'youtube' ? '▶️' : 
                         note.linkType === 'article' ? '📄' : '🔗';
            return (
              <a key={i} href={note.url} target="_blank" rel="noopener" style={{ color: '#4f46e5', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '8px', marginBottom: '4px' }}>
                {icon} {note.label || note.url}
              </a>
            );
          }
          if (note.content?.startsWith('• ')) {
            return (
              <div key={i} style={{ marginLeft: '16px', marginBottom: '4px', color: '#4A3F35', lineHeight: 1.6 }}>
                • {note.content.replace('• ', '')}
              </div>
            );
          }
          return <div key={i} style={{ marginBottom: '8px', color: '#4A3F35', lineHeight: 1.6 }}>{note.content}</div>;
        })
      )}
    </div>
  );
}
