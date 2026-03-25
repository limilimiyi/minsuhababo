import React, { useState, useEffect, useRef, memo } from 'react';
import { DialogueNodeData, NodeType } from '../types';

interface DialogueNodeProps {
  node: DialogueNodeData;
  isRoot: boolean;
  onUpdate: (id: string, updates: Partial<DialogueNodeData>) => void;
  onAddChild: (parentId: string, type: NodeType) => void;
  onDelete: (id: string) => void;
  isFolded: boolean;
  hasChildren: boolean;
  onToggleFold: (id: string) => void;
  visibleLangs: { kr: boolean; en: boolean; jp: boolean };
  isSelected: boolean;
  onSelect: (id: string) => void;
  isMobileMode?: boolean;
}

function DialogueNodeInner({
  node,
  isRoot,
  onUpdate,
  onAddChild,
  onDelete,
  isFolded,
  hasChildren,
  onToggleFold,
  visibleLangs,
  isSelected,
  onSelect,
  isMobileMode = false,
}: DialogueNodeProps) {
  const [showCharacter, setShowCharacter] = useState(true);
  
  // 입력창 참조 (직접 DOM 제어하여 IME 깨짐 방지)
  const textRefs = {
    kr: useRef<HTMLTextAreaElement>(null),
    en: useRef<HTMLTextAreaElement>(null),
    jp: useRef<HTMLTextAreaElement>(null),
  };
  
  const isEditingRef = useRef<Record<string, boolean>>({});
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // 외부 데이터가 바뀌었을 때 처리
  useEffect(() => {
    (Object.keys(node.translations) as Array<keyof typeof textRefs>).forEach(lang => {
      const ref = textRefs[lang].current;
      // 현재 내가 입력 중인 칸이 아닐 때만 외부 데이터 반영
      if (ref && !isEditingRef.current[lang]) {
        if (ref.value !== node.translations[lang]) {
          ref.value = node.translations[lang] || '';
        }
      }
    });
  }, [node.translations]);

  const stopCapture = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleInput = (lang: keyof DialogueNodeData['translations'], value: string) => {
    isEditingRef.current[lang] = true;

    // 서버 업데이트 디바운싱
    if (debounceTimers.current[lang]) clearTimeout(debounceTimers.current[lang]);
    debounceTimers.current[lang] = setTimeout(() => {
      onUpdate(node.id, {
        translations: {
          ...node.translations,
          [lang]: value
        }
      });
      // 저장이 완료된 후 잠시 뒤에 편집 상태 해제
      setTimeout(() => {
        if (document.activeElement !== textRefs[lang].current) {
          isEditingRef.current[lang] = false;
        }
      }, 1000);
    }, 500);
  };

  const getTypeColors = () => {
    switch(node.type) {
      case 'question': return { bg: 'bg-blue-50', header: 'bg-blue-100', border: 'border-blue-300', inputBg: 'bg-blue-50/50' };
      case 'choice': return { bg: 'bg-orange-50', header: 'bg-orange-100', border: 'border-orange-300', inputBg: 'bg-orange-50/50' };
      default: return { bg: 'bg-white', header: 'bg-slate-100', border: 'border-slate-300', inputBg: 'bg-transparent' };
    }
  };
  const colors = getTypeColors();
  const nodeBorderWidth = node.is_reviewed ? '4px' : '3px';
  const nodeBorderColor = node.is_reviewed ? '#22c55e' : (node.type === 'question' ? '#93c5fd' : node.type === 'choice' ? '#fdba74' : '#cbd5e1');

  return (
    <div className="relative group">
      {!isMobileMode && (
        <div className={`absolute right-[100%] top-0 mr-2 flex flex-col gap-1 z-20 transition-all duration-200 ${isSelected ? 'opacity-100 visible' : 'opacity-0 invisible lg:group-hover:opacity-100 lg:group-hover:visible'}`}>
          <button onClick={() => onUpdate(node.id, { type: 'dialogue' })} className={`w-7 h-7 ${node.type === 'dialogue' ? 'bg-slate-800 scale-110 z-10' : 'bg-slate-400 hover:bg-slate-600'} text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white transition-all`}>📝</button>
          <button onClick={() => onUpdate(node.id, { type: 'question' })} className={`w-7 h-7 ${node.type === 'question' ? 'bg-blue-600 scale-110 z-10' : 'bg-slate-400 hover:bg-blue-500'} text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white transition-all`}>❓</button>
          <button onClick={() => onUpdate(node.id, { type: 'choice' })} className={`w-7 h-7 ${node.type === 'choice' ? 'bg-orange-500 scale-110 z-10' : 'bg-slate-400 hover:bg-orange-400'} text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white transition-all`}>🔀</button>
        </div>
      )}

      <div 
        className={`tree-node-content relative flex flex-col z-10 rounded-none ${colors.bg} ${isMobileMode ? 'w-full' : 'w-[320px] md:w-[450px] shrink-0 max-w-[95vw]'} shadow-sm transition-all duration-200 cursor-default ${isSelected && !isMobileMode ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}
        style={{ border: `${nodeBorderWidth} solid ${nodeBorderColor}` }}
        onClick={(e) => {
          onSelect(node.id);
          if (!isMobileMode) e.stopPropagation();
        }}
      >
        <div className={`flex items-center px-2 py-1 border-b-[3px] rounded-none ${node.is_reviewed ? 'border-green-500' : colors.border} ${colors.header}`}>
          {showCharacter && (
            <input
              type="text"
              className={`no-pan ${colors.inputBg} border-2 border-transparent hover:${colors.border} rounded-none px-2 py-0.5 text-sm font-black w-1/3 outline-none focus:border-slate-800 text-slate-950 transition-colors`}
              placeholder="캐릭터"
              defaultValue={node.character_name || ''}
              onBlur={(e) => onUpdate(node.id, { character_name: e.target.value })}
              onKeyDownCapture={stopCapture}
              onPointerDownCapture={stopCapture}
              onMouseDownCapture={stopCapture}
            />
          )}
          
          <div className="flex gap-1 items-center ml-auto">
            <button onClick={() => onUpdate(node.id, { is_reviewed: !node.is_reviewed })} className="px-1.5 py-0 rounded-none hover:bg-slate-300 bg-white border-2 border-slate-300 font-bold text-xs h-6 transition-colors text-slate-950">✅</button>
            {!isRoot && <button onClick={() => onDelete(node.id)} className="px-1.5 py-0 rounded-none hover:bg-red-200 bg-white border-2 border-slate-300 font-bold text-xs h-6 transition-colors text-slate-950">❌</button>}
          </div>
        </div>

        <div className="p-1 space-y-1">
          <table className="w-full text-sm border-separate border-spacing-y-0.5">
            <tbody>
              {[
                { id: 'kr', flag: 'kr' },
                { id: 'en', flag: 'en' },
                { id: 'jp', flag: 'jp' }
              ].filter(lang => visibleLangs[lang.id as keyof typeof visibleLangs]).map(lang => (
                <tr key={lang.id}>
                  <td className="pr-2 py-0 font-black text-slate-500 w-10 align-middle text-sm text-center leading-none uppercase">{lang.flag}</td>
                  <td className="py-0">
                    <div className="flex gap-1 items-stretch">
                      <textarea
                        ref={textRefs[lang.id as keyof typeof textRefs]}
                        rows={1}
                        className="no-pan flex-1 border-2 border-slate-200 rounded-none p-1 text-xs resize-y bg-white outline-none focus:border-slate-800 transition-colors block font-medium text-slate-950"
                        defaultValue={node.translations[lang.id as keyof DialogueNodeData['translations']] || ''}
                        onFocus={() => { isEditingRef.current[lang.id] = true; }}
                        onBlur={(e) => { 
                          isEditingRef.current[lang.id] = false;
                          onUpdate(node.id, { translations: { ...node.translations, [lang.id]: e.target.value } });
                        }}
                        onInput={(e) => handleInput(lang.id as keyof DialogueNodeData['translations'], (e.target as HTMLTextAreaElement).value)}
                        onKeyDownCapture={stopCapture}
                        onPointerDownCapture={stopCapture}
                        onMouseDownCapture={stopCapture}
                      />
                      <button
                        onClick={() => {
                          const text = textRefs[lang.id as keyof typeof textRefs].current?.value || '';
                          if (text) navigator.clipboard.writeText(text).catch(() => {});
                        }}
                        className="w-7 flex-shrink-0 border-2 border-slate-200 bg-slate-50 hover:bg-slate-200 flex items-center justify-center transition-colors text-sm text-slate-600 outline-none focus:border-slate-800"
                      >
                        📋
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!isMobileMode && (
        <div className={`absolute left-[100%] top-0 ml-2 flex flex-col gap-1 z-20 transition-all duration-200 ${isSelected ? 'opacity-100 visible' : 'opacity-0 invisible lg:group-hover:opacity-100 lg:group-hover:visible'}`}>
          <button onClick={() => onAddChild(node.id, 'dialogue')} className="w-7 h-7 bg-slate-800 hover:bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white">➕</button>
          <button onClick={() => setShowCharacter(!showCharacter)} className={`w-7 h-7 ${showCharacter ? 'bg-slate-500 hover:bg-slate-700' : 'bg-pink-500 hover:bg-pink-600'} text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white`}>👤</button>
          {hasChildren && <button onClick={() => onToggleFold(node.id)} className="w-7 h-7 bg-slate-600 hover:bg-slate-700 text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white">{isFolded ? `🙈` : `👁️`}</button>}
        </div>
      )}
    </div>
  );
}

const DialogueNode = memo(DialogueNodeInner);
export default DialogueNode;
