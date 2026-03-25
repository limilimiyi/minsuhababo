'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import DialogueNode from '../components/DialogueNode';
import { DialogueNodeData, NodeType } from '../types';
import { supabase } from '../lib/supabase';

const INITIAL_NODE: DialogueNodeData = {
  id: 'root-1',
  parent_id: null,
  type: 'dialogue',
  character_name: '주인공',
  is_reviewed: false,
  condition: '',
  translations: { kr: '첫 대사입니다.', en: '', jp: '' }
};

export default function DialogueTreeApp() {
  const [nodes, setNodes] = useState<DialogueNodeData[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [foldedNodes, setFoldedNodes] = useState<Set<string>>(new Set()); // 접힌 노드 ID들
  const [visibleLangs, setVisibleLangs] = useState({ kr: true, en: true, jp: true });
  const transformRef = useRef<any>(null);
  const pendingUpdates = useRef<Record<string, any>>({});

  useEffect(() => {
    const fetchInitialData = async () => {
      const { data, error } = await supabase
        .from('nodes')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        setNodes([INITIAL_NODE]);
      } else if (data && data.length > 0) {
        setNodes(data as DialogueNodeData[]);
      } else {
        await supabase.from('nodes').insert([INITIAL_NODE]);
        setNodes([INITIAL_NODE]);
      }
      setIsLoaded(true);
    };

    fetchInitialData();
  }, []);

  useEffect(() => {
    if (isLoaded && transformRef.current) {
      setTimeout(() => {
        handleResetView();
      }, 200);
    }
  }, [isLoaded, nodes]);

  useEffect(() => {
    const channel = supabase
      .channel('nodes-realtime')
      .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'nodes' }, 
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setNodes(prev => prev.find(n => n.id === payload.new.id) ? prev : [...prev, payload.new as DialogueNodeData]);
            } else if (payload.eventType === 'UPDATE') {
              setNodes(prev => prev.map(n => n.id === payload.new.id ? { ...n, ...payload.new } : n));
            } else if (payload.eventType === 'DELETE') {
              setNodes(prev => prev.filter(n => n.id !== payload.old.id));
            }
          })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleUpdateNode = useCallback(async (id: string, updates: Partial<DialogueNodeData>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));

    if (pendingUpdates.current[id]) clearTimeout(pendingUpdates.current[id]);
    pendingUpdates.current[id] = setTimeout(async () => {
      await supabase.from('nodes').update(updates).eq('id', id);
      delete pendingUpdates.current[id];
    }, 400);
  }, []);

  const handleAddChild = useCallback(async (parent_id: string, type: NodeType) => {
    const newNode: DialogueNodeData = {
      id: `node-${Date.now()}`,
      parent_id,
      type,
      character_name: '',
      is_reviewed: false,
      condition: '',
      translations: { kr: '', en: '', jp: '' }
    };
    setNodes(prev => [...prev, newNode]);
    const { error } = await supabase.from('nodes').insert([newNode]);
    if (error) setNodes(prev => prev.filter(n => n.id !== newNode.id));
    
    // 자식을 추가하면 자동으로 부모의 접기 해제
    setFoldedNodes(prev => {
      const next = new Set(prev);
      next.delete(parent_id);
      return next;
    });
  }, []);

  const handleDeleteNode = useCallback(async (id: string) => {
    if (confirm('이 대사와 모든 하위 대사를 삭제할까요?')) {
      setNodes(prev => prev.filter(n => n.id !== id)); // 즉각적인 UI 반영 (빨리빨리)
      await supabase.from('nodes').delete().eq('id', id);
    }
  }, []);

  const toggleFold = (id: string) => {
    setFoldedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleResetView = useCallback(() => {
    if (!transformRef.current) return;
    const rootNode = nodes.find(n => n.parent_id === null);
    if (rootNode) {
      const el = document.getElementById(`tree-node-${rootNode.id}`);
      const content = transformRef.current.instance.contentComponent;
      const wrapper = transformRef.current.instance.wrapperComponent;
      
      if (el && content && wrapper) {
        const elRect = el.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const currentScale = transformRef.current.instance.transformState.scale;
        
        // Calculate the element's exact center coordinates in the unscaled content area
        const unscaledElX = (elRect.left - contentRect.left + elRect.width / 2) / currentScale;
        const unscaledElY = (elRect.top - contentRect.top + elRect.height / 2) / currentScale;
        
        // Align horizontally centered and vertically at 1/4th of the screen
        const targetScale = 1;
        const targetX = (wrapper.offsetWidth / 2) - unscaledElX * targetScale;
        const targetY = (wrapper.offsetHeight / 4) - unscaledElY * targetScale;
        
        transformRef.current.setTransform(targetX, targetY, targetScale, 300);
      } else {
        transformRef.current.centerView(1, 300);
      }
    } else {
      transformRef.current.centerView(1, 300);
    }
  }, [nodes]);

  const renderTree = (parent_id: string | null, depth = 0) => {
    if (depth > 200) return null;
    const childrenNodes = nodes.filter(n => n.parent_id === parent_id);
    if (childrenNodes.length === 0) return null;

    const isSingleChild = childrenNodes.length === 1;

    return (
      <div className={`${parent_id ? "tree-children" : "tree-container"} ${isSingleChild ? 'single-child' : ''}`}>
        {childrenNodes.map(node => {
          const hasChildren = nodes.some(n => n.parent_id === node.id);
          const isFolded = foldedNodes.has(node.id);

          return (
            <div key={node.id} id={`tree-node-${node.id}`} className="tree-node-wrapper">
              <DialogueNode
                node={node}
                isRoot={node.parent_id === null}
                onUpdate={handleUpdateNode}
                onAddChild={handleAddChild}
                onDelete={handleDeleteNode}
                isFolded={isFolded}
                hasChildren={hasChildren}
                onToggleFold={() => toggleFold(node.id)}
                visibleLangs={visibleLangs}
              />
              {!isFolded && renderTree(node.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-screen bg-slate-100 flex flex-col overflow-hidden font-sans">
      <style dangerouslySetInnerHTML={{__html: `
        .tree-container { display: flex; flex-direction: column; align-items: center; }
        .tree-children { display: flex; flex-direction: row; justify-content: center; align-items: flex-start; position: relative; margin-top: 24px; }
        .tree-children::before { content: ''; position: absolute; top: -24px; left: 50%; width: 4px; height: 24px; background-color: #cbd5e1; transform: translateX(-50%); }
        .tree-node-wrapper { display: flex; flex-direction: column; align-items: center; position: relative; padding: 0 60px; padding-top: 24px; }
        .tree-node-wrapper::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 4px; background-color: #cbd5e1; }
        .tree-node-wrapper::after { content: ''; position: absolute; top: 0; left: 50%; width: 4px; height: 24px; background-color: #cbd5e1; transform: translateX(-50%); }
        .tree-node-wrapper:only-child::before { display: none; }
        .tree-node-wrapper:first-child::before { left: 50%; width: 50%; }
        .tree-node-wrapper:last-child::before { left: 0; width: 50%; }
        .single-child { margin-top: 0 !important; }
        .single-child::before { display: none !important; }
        .single-child > .tree-node-wrapper { padding-top: 0 !important; }
        .single-child > .tree-node-wrapper::before, .single-child > .tree-node-wrapper::after { display: none !important; }
        .tree-container > .tree-node-wrapper { padding-top: 0; }
      `}} />

      <div className="flex-shrink-0 p-4 shadow-sm bg-white border-b border-slate-200 flex justify-between items-center z-20 relative px-8">
        <div className="flex items-center gap-3 group cursor-default">
          <div className="w-10 h-10 bg-slate-800 rounded flex items-center justify-center font-black text-white text-xl shadow-lg group-hover:bg-blue-600 transition-colors">S</div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">SUHA<span className="text-blue-600 italic">BABO</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-slate-200 p-1 rounded">
            {[
              { id: 'kr', label: 'KR' },
              { id: 'en', label: 'EN' },
              { id: 'jp', label: 'JP' }
            ].map(lang => (
              <button
                key={lang.id}
                onClick={() => setVisibleLangs(prev => ({ ...prev, [lang.id]: !prev[lang.id as keyof typeof prev] }))}
                className={`px-3 py-1 rounded text-xs font-black transition-colors ${visibleLangs[lang.id as keyof typeof visibleLangs] ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}
              >
                {lang.label}
              </button>
            ))}
          </div>
          <button onClick={handleResetView} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold text-sm shadow-lg transition-all active:scale-95 flex items-center gap-2">🏠</button>
          
          <div className="relative group flex items-center ml-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 hover:bg-blue-100 text-slate-500 hover:text-blue-600 font-black text-sm flex items-center justify-center transition-colors cursor-help">
              ?
            </div>
            <div className="absolute right-0 top-full mt-2 w-max max-w-sm bg-slate-800 text-white p-4 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] border-2 border-slate-700 pointer-events-none">
              <h3 className="font-bold text-sm mb-3 text-slate-300 border-b border-slate-700 pb-2">기능 설명 / Help / ヘルプ</h3>
              
              <div className="text-[11px] text-slate-300 mb-4 space-y-1.5 bg-slate-700/50 p-2.5 rounded-lg border border-slate-600/50">
                <p>💡 <b>언어 필터:</b> 상단 <b>KR/EN/JP</b> 버튼으로 보고 싶은 언어만 골라서 볼 수 있습니다.</p>
                <p>💡 <b>색상 구분:</b> 종류 버튼(📝❓🔀)을 누르면 대사 상자의 <b>색상이 변해서</b> 시각적으로 알아보기 아주 쉽습니다!</p>
              </div>

              <ul className="text-xs space-y-2.5 font-medium tracking-tight">
                <li className="flex gap-2 items-center"><span className="w-6 text-center text-base">📝</span> <span>일반 대사 / Dialogue / 通常のセリフ</span></li>
                <li className="flex gap-2 items-center"><span className="w-6 text-center text-base">❓</span> <span>질문 / Question / 質問</span></li>
                <li className="flex gap-2 items-center"><span className="w-6 text-center text-base">🔀</span> <span>선택지 / Choice / 選択肢</span></li>
                <li className="flex gap-2 items-center"><span className="w-6 text-center text-base">➕</span> <span>하위 대사 추가 / Add Child / 子セリフ追加</span></li>
                <li className="flex gap-2 items-center"><span className="w-6 text-center text-base">👤</span> <span>캐릭터 칸 숨기기 / Toggle Character / キャラクタートグル</span></li>
                <li className="flex gap-2 items-center"><span className="w-6 text-center text-base">👁️</span> <span>하위 대사 접기 / Fold Lines / 折りたたむ・展開</span></li>
                <li className="flex gap-2 items-center"><span className="w-6 text-center text-base">✅</span> <span>검토 완료 / Review Complete / 確認完了</span></li>
                <li className="flex gap-2 items-center"><span className="w-6 text-center text-base">🗑️</span> <span>대사 삭제 / Delete / セリフ削除</span></li>
                <li className="flex gap-2 items-center"><span className="w-6 text-center text-base">📋</span> <span>텍스트 복사 / Copy Text / テキストをコピー</span></li>
                <li className="flex gap-2 items-center"><span className="w-6 text-center text-base">🏠</span> <span>최초 대사로 이동 / Reset View / 視点をリセット</span></li>
              </ul>
            </div>
          </div>

          <div className="text-xs font-bold text-slate-400 border-l pl-4 border-slate-200">● LIVE</div>
        </div>
      </div>

      <div className="flex-1 relative bg-slate-600" style={{ backgroundImage: 'radial-gradient(#475569 2px, transparent 2px)', backgroundSize: '40px 40px' }}>
        {!isLoaded ? (
          <div className="h-full w-full flex items-center justify-center text-white font-black text-2xl animate-pulse tracking-widest bg-slate-800 z-50">SYNCING...</div>
        ) : (
          <>
            <div className="fixed right-8 bottom-8 flex flex-col gap-2 bg-white/90 backdrop-blur-sm p-3 rounded-2xl shadow-2xl border-4 border-slate-300" style={{ zIndex: 9999 }}>
              <button onClick={() => transformRef.current?.zoomIn()} className="w-12 h-12 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-black text-2xl flex items-center justify-center transition-all active:scale-90 shadow-sm" title="확대(Zoom In)">➕</button>
              <button onClick={() => transformRef.current?.zoomOut()} className="w-12 h-12 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-black text-2xl flex items-center justify-center transition-all active:scale-90 shadow-sm" title="축소(Zoom Out)">➖</button>
              <button onClick={handleResetView} className="w-12 h-12 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-xl flex items-center justify-center transition-all active:scale-90 shadow-lg mt-2" title="최초 노드로 화면 정중앙 이동(Reset View)">🏠</button>
            </div>
            <TransformWrapper ref={transformRef} initialScale={1} minScale={0.1} maxScale={4} centerOnInit={true} limitToBounds={false} doubleClick={{ disabled: true }} panning={{ excluded: ["input", "textarea", "select", "button", "no-pan"] }}>
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "auto", height: "auto" }}>
                <div className="p-[500px] inline-flex flex-col items-center">{renderTree(null)}</div>
              </TransformComponent>
            </TransformWrapper>
          </>
        )}
      </div>
    </div>
  );
}
