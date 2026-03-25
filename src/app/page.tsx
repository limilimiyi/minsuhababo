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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // 사이드바 상태
  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(new Set()); // 장면 리스트 접기 상태
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null); // 현재 편집 중인 장면 ID
  const transformRef = useRef<any>(null);
  const pendingUpdates = useRef<Record<string, any>>({});

  // 장면(Scene) 데이터 추출 로직
  const getScenes = useCallback(() => {
    const scenes: { id: string; title: string; customName: string | null; number: string; depth: number; parentSceneId: string | null }[] = [];
    
    const traverse = (nodeId: string, depth: number, parentSceneId: string | null, parentNumber: string) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const children = nodes.filter(n => n.parent_id === nodeId);
      const parentNode = nodes.find(n => n.id === node.parent_id);
      
      // 장면 추가 조건: 루트이거나 부모가 분기점(자식이 2개 이상)인 경우
      const siblings = parentNode ? nodes.filter(n => n.parent_id === parentNode.id) : [];
      const isNewScene = !parentNode || siblings.length > 1;
      
      let currentSceneId = parentSceneId;
      let currentNumber = parentNumber;

      if (isNewScene) {
        currentSceneId = node.id;
        // 형제 노드들 사이에서의 인덱스를 찾아 번호 생성 (예: 1-1, 1-2)
        const sceneIndex = siblings.length > 0 ? siblings.indexOf(node) + 1 : 1;
        currentNumber = parentNumber ? `${parentNumber}-${sceneIndex}` : `${sceneIndex}`;
        
        scenes.push({
          id: node.id,
          title: node.translations.kr || "내용 없음",
          customName: node.scene_name || null,
          number: currentNumber,
          depth,
          parentSceneId
        });
      }

      // 자식 노드 탐색
      children.forEach(child => {
        traverse(child.id, isNewScene ? depth + 1 : depth, currentSceneId, currentNumber);
      });
    };

    const root = nodes.find(n => n.parent_id === null);
    if (root) traverse(root.id, 0, null, "");
    return scenes;
  }, [nodes]);

  const toggleSceneCollapse = (id: string) => {
    setCollapsedScenes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSceneClick = (id: string) => {
    if (isMobileView) {
      setFocusedNodeId(id);
    } else {
      setSelectedNodeId(id);
      const el = document.getElementById(`tree-node-${id}`);
      if (el && transformRef.current) {
        // 해당 노드로 화면 이동 로직
        const content = transformRef.current.instance.contentComponent;
        const wrapper = transformRef.current.instance.wrapperComponent;
        const elRect = el.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const currentScale = transformRef.current.instance.transformState.scale;
        
        const unscaledElX = (elRect.left - contentRect.left + elRect.width / 2) / currentScale;
        const unscaledElY = (elRect.top - contentRect.top + elRect.height / 2) / currentScale;
        
        const targetX = (wrapper.offsetWidth / 2) - unscaledElX * currentScale;
        const targetY = (wrapper.offsetHeight / 4) - unscaledElY * currentScale;
        
        transformRef.current.setTransform(targetX, targetY, currentScale, 300);
      }
    }
    setIsSidebarOpen(false);
  };

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
  }, [isLoaded]); // nodes 의존성 제거: 타이핑 시 리셋 방지

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

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
                isSelected={selectedNodeId === node.id}
                onSelect={(id) => setSelectedNodeId(id)}
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
        .tree-node-wrapper { display: flex; flex-direction: column; align-items: center; position: relative; padding: 0 16px; padding-top: 24px; }
        @media (min-width: 768px) {
          .tree-node-wrapper { padding: 0 60px; padding-top: 24px; }
        }
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

      <div className="fixed top-0 left-0 w-full flex-shrink-0 p-3 md:p-4 shadow-sm bg-white border-b border-slate-200 flex justify-between items-center z-[100] px-3 md:px-8">
        <div 
          className="flex items-center gap-2 md:gap-3 group cursor-pointer" 
          onClick={() => setIsSidebarOpen(true)}
          title="장면 리스트 보기"
        >
          <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-800 rounded flex items-center justify-center font-black text-white text-lg md:text-xl shadow-lg group-hover:bg-blue-600 transition-colors">S</div>
          <h1 className="text-lg md:text-2xl font-black text-slate-800 tracking-tighter uppercase hidden sm:block">SUHA<span className="text-blue-600 italic">BABO</span></h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          <div className="flex gap-1 bg-slate-200 p-0.5 md:p-1 rounded">
            {[
              { id: 'kr', label: 'KR' },
              { id: 'en', label: 'EN' },
              { id: 'jp', label: 'JP' }
            ].map(lang => (
              <button
                key={lang.id}
                onClick={() => setVisibleLangs(prev => ({ ...prev, [lang.id]: !prev[lang.id as keyof typeof prev] }))}
                className={`px-2 md:px-3 py-1 rounded text-[10px] md:text-xs font-black transition-colors ${visibleLangs[lang.id as keyof typeof visibleLangs] ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}
              >
                {lang.label}
              </button>
            ))}
          </div>
          <button onClick={() => setIsMobileView(!isMobileView)} className="p-1 md:px-3 md:py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-lg md:text-sm shadow-lg transition-all active:scale-95 flex items-center justify-center" title="모바일 뷰 전환">{isMobileView ? "💻" : "📱"}</button>
          <button onClick={handleResetView} className="p-2 md:px-4 md:py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold text-sm shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">🏠</button>
          
          <div className="relative group flex items-center ml-1 md:ml-2">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-slate-200 hover:bg-blue-100 text-slate-500 hover:text-blue-600 font-black text-xs md:text-sm flex items-center justify-center transition-colors cursor-help">
              ?
            </div>
            <div className="absolute right-0 top-full mt-2 w-max max-w-[90vw] md:max-w-sm bg-slate-800 text-white p-3 md:p-4 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] border-2 border-slate-700 pointer-events-none">
              <h3 className="font-bold text-sm mb-3 text-slate-300 border-b border-slate-700 pb-2">기능 설명 / Help / ヘルプ</h3>
              
              <div className="text-[11px] text-slate-300 mb-4 space-y-1.5 bg-slate-700/50 p-2.5 rounded-lg border border-slate-600/50">
                <p>💡 <b>언어 필터:</b> 상단 <b>KR/EN/JP</b> 버튼으로 보고 싶은 언어만 골라서 볼 수 있습니다.</p>
                <p>💡 <b>색상 구분:</b> 종류 버튼(📝❓🔀)을 누르면 대사 상자의 <b>색상이 변해서</b> 시각적으로 알아보기 아주 쉽습니다!</p>
              </div>

              <div className="mb-4">
                <button 
                  onClick={() => setIsMobileView(!isMobileView)} 
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {isMobileView ? "💻 PC 화면으로 전환" : "📱 모바일 화면으로 전환"}
                </button>
              </div>

              <ul className="text-[11px] md:text-xs space-y-2.5 font-medium tracking-tight">
                <li className="flex gap-2 items-center"><span className="w-5 md:w-6 text-center text-sm md:text-base">📝</span> <span>노드 종류: 일반 대사 / Type: Dialogue</span></li>
                <li className="flex gap-2 items-center"><span className="w-5 md:w-6 text-center text-sm md:text-base">❓</span> <span>노드 종류: 질문 / Type: Question</span></li>
                <li className="flex gap-2 items-center"><span className="w-5 md:w-6 text-center text-sm md:text-base">🔀</span> <span>노드 종류: 선택지 / Type: Choice</span></li>
                <li className="flex gap-2 items-center"><span className="w-5 md:w-6 text-center text-sm md:text-base">➕</span> <span>하위 대사 추가 / Add Child</span></li>
                <li className="flex gap-2 items-center"><span className="w-5 md:w-6 text-center text-sm md:text-base">👤</span> <span>캐릭터 칸 숨기기 / Toggle Character</span></li>
                <li className="flex gap-2 items-center"><span className="w-5 md:w-6 text-center text-sm md:text-base">👁️</span> <span>하위 대사 접기 / Fold Lines</span></li>
                <li className="flex gap-2 items-center"><span className="w-5 md:w-6 text-center text-sm md:text-base">✅</span> <span>검토 완료 / Review Complete</span></li>
                <li className="flex gap-2 items-center"><span className="w-5 md:w-6 text-center text-sm md:text-base">❌</span> <span>대사 삭제 / Delete</span></li>
                <li className="flex gap-2 items-center"><span className="w-5 md:w-6 text-center text-sm md:text-base">📋</span> <span>텍스트 복사 / Copy Text</span></li>
                <li className="flex gap-2 items-center"><span className="w-5 md:w-6 text-center text-sm md:text-base">🏠</span> <span>최초 대사로 이동 / Reset View</span></li>
              </ul>
            </div>
          </div>

          <div className="hidden md:block text-xs font-bold text-slate-400 border-l pl-4 border-slate-200">● LIVE</div>
        </div>
      </div>

      <div className="flex-1 relative bg-slate-600 pt-[60px] md:pt-[72px]" style={{ backgroundImage: 'radial-gradient(#475569 2px, transparent 2px)', backgroundSize: '40px 40px' }}>
        {!isLoaded ? (
          <div className="h-full w-full flex items-center justify-center text-white font-black text-2xl animate-pulse tracking-widest bg-slate-800 z-50">SYNCING...</div>
        ) : isMobileView ? (
          <div className="h-full w-full relative flex flex-col items-center justify-center p-4 overflow-y-auto pb-32">
            {(() => {
              const rootNode = nodes.find(n => n.parent_id === null) || INITIAL_NODE;
              const currentFocusedNode = nodes.find(n => n.id === focusedNodeId) || rootNode;
              
              if (!currentFocusedNode) return (
                <div className="flex flex-col items-center justify-center h-full text-white gap-4">
                  <p className="font-bold">데이터를 불러오는 중이거나 노드가 없습니다.</p>
                  <button onClick={() => setNodes([INITIAL_NODE])} className="px-4 py-2 bg-blue-600 rounded">초기화</button>
                </div>
              );

              const childrenNodes = nodes.filter(n => n.parent_id === currentFocusedNode.id);
              return (
                <div className="flex flex-col items-center gap-8 w-full">
                  {/* 부모 노드로 이동 (위쪽) */}
                  <div className="h-16 flex items-center justify-center">
                    <button 
                      disabled={currentFocusedNode.parent_id === null} 
                      onClick={() => setFocusedNodeId(currentFocusedNode.parent_id)} 
                      className={`w-12 h-12 flex items-center justify-center rounded-full font-black text-2xl transition-all shadow-xl ${currentFocusedNode.parent_id === null ? 'bg-slate-700/30 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-800 active:scale-90 hover:bg-blue-50'}`}
                      title="이전 대사로 (부모 노드)"
                    >
                      ↑
                    </button>
                  </div>

                  {/* 현재 선택된 노드 */}
                  <div className="w-full max-w-[450px]">
                    <DialogueNode 
                      node={currentFocusedNode} 
                      isRoot={currentFocusedNode.parent_id === null} 
                      onUpdate={handleUpdateNode} 
                      onAddChild={handleAddChild} 
                      onDelete={handleDeleteNode} 
                      isFolded={false} 
                      hasChildren={childrenNodes.length > 0} 
                      onToggleFold={() => {}} 
                      visibleLangs={visibleLangs} 
                      isSelected={true} 
                      onSelect={() => {}} 
                      isMobileMode={true} 
                    />
                  </div>

                  {/* 자식 노드들로 이동 (아래쪽) */}
                  <div className="flex flex-wrap justify-center gap-4 w-full px-4 min-h-[80px]">
                    {childrenNodes.length === 0 ? (
                      <div className="text-slate-400 text-sm font-bold flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-slate-700/30 flex items-center justify-center text-slate-500">↓</div>
                        <span>마지막 대사입니다</span>
                      </div>
                    ) : (
                      childrenNodes.map((child, i) => (
                        <div key={child.id} className="flex flex-col items-center gap-2">
                          <span className="bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded shadow-lg font-bold">
                            {child.type === 'choice' ? '선택지' : child.type === 'question' ? '질문' : `대사 ${i + 1}`}
                          </span>
                          <button 
                            onClick={() => setFocusedNodeId(child.id)} 
                            className="w-12 h-12 flex items-center justify-center rounded-full font-black text-2xl bg-white text-slate-800 shadow-xl transition-all active:scale-90 hover:bg-emerald-50"
                          >
                            ↓
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* 하단 편집 도구바 (Fixed) */}
                  <div className="fixed bottom-0 left-0 w-full bg-slate-900 border-t border-slate-700 text-white p-4 flex justify-between items-center shadow-2xl z-50 px-6">
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdateNode(currentFocusedNode.id, { type: 'dialogue' })} className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${currentFocusedNode.type === 'dialogue' ? 'bg-slate-500' : 'bg-slate-700 hover:bg-slate-600'}`}>📝</button>
                      <button onClick={() => handleUpdateNode(currentFocusedNode.id, { type: 'question' })} className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${currentFocusedNode.type === 'question' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-blue-600'}`}>❓</button>
                      <button onClick={() => handleUpdateNode(currentFocusedNode.id, { type: 'choice' })} className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${currentFocusedNode.type === 'choice' ? 'bg-orange-600' : 'bg-slate-700 hover:bg-orange-600'}`}>🔀</button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAddChild(currentFocusedNode.id, 'dialogue')} className="w-10 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center text-lg shadow-lg">➕</button>
                      <button onClick={() => handleUpdateNode(currentFocusedNode.id, { is_reviewed: !currentFocusedNode.is_reviewed })} className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${currentFocusedNode.is_reviewed ? 'bg-green-600' : 'bg-slate-700 hover:bg-slate-600'}`}>✅</button>
                      {currentFocusedNode.parent_id !== null && <button onClick={() => handleDeleteNode(currentFocusedNode.id)} className="w-10 h-10 rounded-lg bg-red-600/80 hover:bg-red-500 flex items-center justify-center text-lg">❌</button>}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <>
            <div className="fixed right-4 bottom-4 md:right-8 md:bottom-8 flex flex-col gap-1 md:gap-2 bg-white/90 backdrop-blur-sm p-2 md:p-3 rounded-xl md:rounded-2xl shadow-2xl border-2 md:border-4 border-slate-300" style={{ zIndex: 9999 }}>
              <button onClick={() => transformRef.current?.zoomIn()} className="w-9 h-9 md:w-12 md:h-12 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg md:rounded-xl font-black text-lg md:text-2xl flex items-center justify-center transition-all active:scale-90 shadow-sm" title="확대(Zoom In)">➕</button>
              <button onClick={() => transformRef.current?.zoomOut()} className="w-9 h-9 md:w-12 md:h-12 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg md:rounded-xl font-black text-lg md:text-2xl flex items-center justify-center transition-all active:scale-90 shadow-sm" title="축소(Zoom Out)">➖</button>
            </div>
            <TransformWrapper ref={transformRef} initialScale={1} minScale={0.1} maxScale={4} centerOnInit={true} limitToBounds={false} doubleClick={{ disabled: true }} panning={{ excluded: ["input", "textarea", "select", "button", "no-pan"] }}>
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "auto", height: "auto" }}>
                <div 
                  className="p-[100px] md:p-[500px] inline-flex flex-col items-center"
                  onClick={() => setSelectedNodeId(null)}
                >
                  {renderTree(null)}
                </div>
              </TransformComponent>
            </TransformWrapper>
          </>
        )}
      </div>

      {/* 장면 리스트 사이드바 */}
      {isSidebarOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-[200] backdrop-blur-sm transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="fixed left-0 top-0 h-full w-[280px] md:w-[350px] bg-white z-[210] shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">SCENE LIST</h2>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors font-bold"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {getScenes().map((scene, index) => {
                // 부모 장면이 접혀있는지 확인
                let isParentCollapsed = false;
                let currentParentId = scene.parentSceneId;
                while (currentParentId) {
                  if (collapsedScenes.has(currentParentId)) {
                    isParentCollapsed = true;
                    break;
                  }
                  const parent = getScenes().find(s => s.id === currentParentId);
                  currentParentId = parent ? parent.parentSceneId : null;
                }

                if (isParentCollapsed) return null;

                const hasSubScenes = getScenes().some(s => s.parentSceneId === scene.id);
                const isCollapsed = collapsedScenes.has(scene.id);
                const title = scene.customName || scene.title || "내용 없음";
                const isEditing = editingSceneId === scene.id;

                return (
                  <div 
                    key={scene.id} 
                    className="group flex items-center"
                    style={{ paddingLeft: `${scene.depth * 16}px` }}
                  >
                    <button
                      onClick={() => toggleSceneCollapse(scene.id)}
                      className={`w-6 h-6 flex items-center justify-center transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'} ${hasSubScenes ? 'visible' : 'invisible'}`}
                    >
                      <span className="text-slate-400 font-bold" style={{ fontSize: `${Math.max(14 - scene.depth * 2, 8)}px` }}>▶</span>
                    </button>
                    <div 
                      className={`flex-1 px-3 py-1 rounded-lg transition-all flex items-center gap-2 hover:bg-slate-100 ${selectedNodeId === scene.id ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600'}`}
                    >
                      <span className="text-[10px] font-black opacity-30 flex-shrink-0">#{scene.number}</span>
                      
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          className="w-full text-sm bg-white border border-blue-400 px-1 py-0.5 rounded outline-none"
                          defaultValue={scene.customName || title}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateNode(scene.id, { scene_name: (e.target as HTMLInputElement).value });
                              setEditingSceneId(null);
                            } else if (e.key === 'Escape') {
                              setEditingSceneId(null);
                            }
                          }}
                          onBlur={(e) => {
                            handleUpdateNode(scene.id, { scene_name: e.target.value });
                            setEditingSceneId(null);
                          }}
                        />
                      ) : (
                        <div className="flex-1 flex items-center justify-between min-w-0">
                          <span 
                            className="truncate text-sm font-medium cursor-pointer"
                            onClick={() => handleSceneClick(scene.id)}
                            onDoubleClick={() => setEditingSceneId(scene.id)}
                          >
                            {title.length > 25 ? title.substring(0, 25) + '...' : title}
                          </span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSceneId(scene.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 transition-all text-[10px]"
                            title="장면 이름 수정"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 font-bold text-center">
              분기점을 기준으로 장면이 자동 생성됩니다.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
