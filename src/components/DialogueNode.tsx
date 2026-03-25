import React, { useState } from 'react';
import { DialogueNodeData, NodeType } from '../types';

interface DialogueNodeProps {
  node: DialogueNodeData;
  isRoot: boolean;
  onUpdate: (id: string, updates: Partial<DialogueNodeData>) => void;
  onAddChild: (parentId: string, type: NodeType) => void;
  onDelete: (id: string) => void;
  isFolded: boolean;
  hasChildren: boolean;
  onToggleFold: () => void;
  visibleLangs: { kr: boolean; en: boolean; jp: boolean };
}

export default function DialogueNode({
  node,
  isRoot,
  onUpdate,
  onAddChild,
  onDelete,
  isFolded,
  hasChildren,
  onToggleFold,
  visibleLangs,
}: DialogueNodeProps) {
  const [showCharacter, setShowCharacter] = useState(true);

  const stopCapture = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleTranslationChange = (lang: keyof DialogueNodeData['translations'], value: string) => {
    onUpdate(node.id, {
      translations: {
        ...node.translations,
        [lang]: value
      }
    });
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
      {/* 좌측 플로팅 버튼 영역 (타입 선택) */}
      <div className="absolute right-[100%] top-0 mr-2 flex flex-col gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onUpdate(node.id, { type: 'dialogue' })}
          className={`w-7 h-7 ${node.type === 'dialogue' ? 'bg-slate-800 scale-110 z-10' : 'bg-slate-400 hover:bg-slate-600'} text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white transition-all`}
          title="일반 대사"
        >
          📝
        </button>
        <button
          onClick={() => onUpdate(node.id, { type: 'question' })}
          className={`w-7 h-7 ${node.type === 'question' ? 'bg-blue-600 scale-110 z-10' : 'bg-slate-400 hover:bg-blue-500'} text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white transition-all`}
          title="질문"
        >
          ❓
        </button>
        <button
          onClick={() => onUpdate(node.id, { type: 'choice' })}
          className={`w-7 h-7 ${node.type === 'choice' ? 'bg-orange-500 scale-110 z-10' : 'bg-slate-400 hover:bg-orange-400'} text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white transition-all`}
          title="선택지"
        >
          🔀
        </button>
      </div>

      {/* 본체 노드 */}
      <div className={`tree-node-content relative flex flex-col z-10 rounded-none ${colors.bg}`}
           style={{ minWidth: '450px', border: `${nodeBorderWidth} solid ${nodeBorderColor}` }}
      >
        {/* Top Section */}
        <div className={`flex items-center px-2 py-1 border-b-[3px] rounded-none ${node.is_reviewed ? 'border-green-500' : colors.border} ${colors.header}`}>
          {showCharacter && (
            <input
              type="text"
              className={`no-pan ${colors.inputBg} border-2 border-transparent hover:${colors.border} rounded-none px-2 py-0.5 text-sm font-black w-1/3 outline-none focus:border-slate-800 text-slate-950 transition-colors`}
              placeholder="캐릭터"
              value={node.character_name || ''}
              onChange={(e) => onUpdate(node.id, { character_name: e.target.value })}
              onKeyDownCapture={stopCapture}
              onPointerDownCapture={stopCapture}
              onMouseDownCapture={stopCapture}
            />
          )}
          
          <div className="flex gap-1 items-center ml-auto">
            <button
              onClick={() => onUpdate(node.id, { is_reviewed: !node.is_reviewed })}
              className="px-1.5 py-0 rounded-none hover:bg-slate-300 bg-white border-2 border-slate-300 font-bold text-xs h-6 transition-colors text-slate-950"
            >
              ✅
            </button>
            {!isRoot && (
              <button
                onClick={() => onDelete(node.id)}
                className="px-1.5 py-0 rounded-none hover:bg-red-200 bg-white border-2 border-slate-300 font-bold text-xs h-6 transition-colors text-slate-950"
                title="대사 삭제"
              >
                ❌
              </button>
            )}
          </div>
        </div>

        {/* Middle Section */}
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
                        rows={1}
                        className="no-pan flex-1 border-2 border-slate-200 rounded-none p-1 text-xs resize-y bg-white outline-none focus:border-slate-800 transition-colors block font-medium text-slate-950"
                        value={node.translations?.[lang.id as keyof DialogueNodeData['translations']] || ''}
                        onChange={(e) => handleTranslationChange(lang.id as keyof DialogueNodeData['translations'], e.target.value)}
                        onKeyDownCapture={stopCapture}
                        onPointerDownCapture={stopCapture}
                        onMouseDownCapture={stopCapture}
                      />
                      <button
                        onClick={() => {
                          const text = node.translations?.[lang.id as keyof DialogueNodeData['translations']] || '';
                          if (text) {
                            navigator.clipboard.writeText(text).catch(() => {});
                          }
                        }}
                        className="w-7 flex-shrink-0 border-2 border-slate-200 bg-slate-50 hover:bg-slate-200 flex items-center justify-center transition-colors text-sm text-slate-600 outline-none focus:border-slate-800"
                        title="복사 (Copy)"
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

      {/* 우측 플로팅 버튼 영역 */}
      <div className="absolute left-[100%] top-0 ml-2 flex flex-col gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onAddChild(node.id, 'dialogue')}
          className="w-7 h-7 bg-slate-800 hover:bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white"
          title="하위 대사 추가"
        >
          ➕
        </button>
        <button
          onClick={() => setShowCharacter(!showCharacter)}
          className={`w-7 h-7 ${showCharacter ? 'bg-slate-500 hover:bg-slate-700' : 'bg-pink-500 hover:bg-pink-600'} text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white`}
          title={showCharacter ? '캐릭터 숨기기' : '캐릭터 보이기'}
        >
          👤
        </button>
        {hasChildren && (
          <button
            onClick={onToggleFold}
            className="w-7 h-7 bg-slate-600 hover:bg-slate-700 text-white flex items-center justify-center font-black text-sm shadow-md border-2 border-white"
            title={isFolded ? "펼치기" : "접기"}
          >
            {isFolded ? `🙈` : `👁️`}
          </button>
        )}
      </div>
    </div>
  );
}
