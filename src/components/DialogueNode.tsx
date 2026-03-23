import React from 'react';
import { DialogueNodeData, NodeType } from '../types';

interface DialogueNodeProps {
  node: DialogueNodeData;
  isRoot: boolean;
  onUpdate: (id: string, updates: Partial<DialogueNodeData>) => void;
  onAddChild: (parentId: string, type: NodeType) => void;
  onDelete: (id: string) => void;
}

export default function DialogueNode({
  node,
  isRoot,
  onUpdate,
  onAddChild,
  onDelete,
}: DialogueNodeProps) {
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

  return (
    <div className={`tree-node-content relative flex flex-col z-10 rounded-none ${node.is_reviewed ? 'bg-green-50' : 'bg-white'}`}
         style={{ minWidth: '450px', border: node.is_reviewed ? '3px solid #16a34a' : '3px solid #64748b' }}
    >
      {/* Top Section */}
      <div className={`flex justify-between items-center px-2 py-1 border-b-2 rounded-none ${node.is_reviewed ? 'border-green-500 bg-green-200/50' : 'border-slate-300 bg-slate-100'}`}>
        <input
          type="text"
          className="no-pan bg-transparent border-2 border-transparent hover:border-slate-400 rounded-none px-2 py-0.5 text-sm font-black w-1/3 outline-none focus:border-slate-800 text-slate-950 transition-colors"
          placeholder="캐릭터"
          value={node.character_name || ''}
          onChange={(e) => onUpdate(node.id, { character_name: e.target.value })}
          onKeyDownCapture={stopCapture}
          onPointerDownCapture={stopCapture}
          onMouseDownCapture={stopCapture}
        />
        
        <div className="flex gap-1 items-center">
          <select 
            value={node.type}
            onChange={(e) => onUpdate(node.id, { type: e.target.value as NodeType })}
            onPointerDownCapture={stopCapture}
            onMouseDownCapture={stopCapture}
            className="no-pan bg-white border-2 border-slate-300 px-1 py-0 text-[10px] font-bold outline-none focus:border-slate-800 cursor-pointer h-6 text-slate-950"
          >
            <option value="dialogue">📝 대사</option>
            <option value="choice">🔀 선택지</option>
          </select>

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
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* Middle Section */}
      <div className="p-1 space-y-1">
        {node.type === 'choice' && (
          <div className="mb-1">
            <input
              type="text"
              className="no-pan w-full border-2 border-orange-300 rounded-none p-1.5 text-xs bg-orange-50 outline-none focus:border-orange-600 transition-colors font-black text-slate-950"
              placeholder="🌿 선택지 조건"
              value={node.condition || ''}
              onChange={(e) => onUpdate(node.id, { condition: e.target.value })}
              onKeyDownCapture={stopCapture}
              onPointerDownCapture={stopCapture}
              onMouseDownCapture={stopCapture}
            />
          </div>
        )}
        
        <table className="w-full text-sm border-separate border-spacing-y-0.5">
          <tbody>
            {[
              { id: 'kr', flag: '🇰🇷' },
              { id: 'en', flag: '🇺🇸' },
              { id: 'jp', flag: '🇯🇵' }
            ].map(lang => (
              <tr key={lang.id}>
                <td className="pr-2 py-0 font-black text-slate-500 w-10 align-middle text-lg text-center leading-none">{lang.flag}</td>
                <td className="py-0">
                  <textarea
                    rows={2}
                    className="no-pan w-full border-2 border-slate-200 rounded-none p-1.5 text-xs resize-y bg-white outline-none focus:border-slate-800 transition-colors block font-medium text-slate-950"
                    value={node.translations?.[lang.id as keyof DialogueNodeData['translations']] || ''}
                    onChange={(e) => handleTranslationChange(lang.id as keyof DialogueNodeData['translations'], e.target.value)}
                    onKeyDownCapture={stopCapture}
                    onPointerDownCapture={stopCapture}
                    onMouseDownCapture={stopCapture}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Section */}
      <div className={`flex justify-center border-t-2 rounded-none ${node.is_reviewed ? 'border-green-500 bg-green-200/50' : 'border-slate-300 bg-slate-100'}`}>
        <button
          onClick={() => onAddChild(node.id, 'dialogue')}
          className="w-full py-1 rounded-none hover:bg-slate-300 flex items-center justify-center font-black text-slate-600 text-lg transition-colors leading-none"
        >
          ➕
        </button>
      </div>
    </div>
  );
}
