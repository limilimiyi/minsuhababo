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

  // 로딩 완료 시 루트 노드 기준으로 중앙 정렬
  useEffect(() => {
    if (isLoaded && transformRef.current) {
      setTimeout(() => {
        transformRef.current.centerView(1, 400);
      }, 200);
    }
  }, [isLoaded]);

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
              setNodes(prev => prev.filter(n => n.id === payload.old.id));
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
  }, []);

  const handleDeleteNode = useCallback(async (id: string) => {
    if (confirm('이 노드와 모든 하위 노드를 삭제할까요?')) {
      await supabase.from('nodes').delete().eq('id', id);
    }
  }, []);

  const renderTree = (parent_id: string | null, depth = 0) => {
    if (depth > 200) return null;
    const childrenNodes = nodes.filter(n => n.parent_id === parent_id);
    if (childrenNodes.length === 0) return null;

    return (
      <div className={parent_id ? "tree-children" : "tree-container"}>
        {childrenNodes.map(node => (
          <div key={node.id} className="tree-node-wrapper">
            <DialogueNode
              node={node}
              isRoot={node.parent_id === null}
              onUpdate={handleUpdateNode}
              onAddChild={handleAddChild}
              onDelete={handleDeleteNode}
            />
            {renderTree(node.id, depth + 1)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="h-screen bg-slate-100 flex flex-col overflow-hidden font-sans">
      <style dangerouslySetInnerHTML={{__html: `
        .tree-container { display: flex; flex-direction: column; align-items: center; }
        .tree-children { display: flex; flex-direction: row; justify-content: center; align-items: flex-start; position: relative; }
        .tree-children::before { content: ''; position: absolute; top: 0; left: 50%; width: 4px; height: 32px; background-color: #cbd5e1; transform: translateX(-50%); }
        
        .tree-node-wrapper { display: flex; flex-direction: column; align-items: center; position: relative; padding: 0 24px; padding-top: 64px; }
        .tree-node-wrapper::before { content: ''; position: absolute; top: 32px; left: 0; width: 100%; height: 4px; background-color: #cbd5e1; }
        .tree-node-wrapper::after { content: ''; position: absolute; top: 32px; left: 50%; width: 4px; height: 32px; background-color: #cbd5e1; transform: translateX(-50%); }
        
        /* 최상위 루트 노드 스타일 보정: 선 제거 및 여백 삭제 */
        .tree-container > .tree-node-wrapper { padding-top: 0; }
        .tree-container > .tree-node-wrapper::before,
        .tree-container > .tree-node-wrapper::after { display: none; }

        .tree-node-wrapper:only-child::before { display: none; }
        .tree-node-wrapper:first-child::before { left: 50%; width: 50%; }
        .tree-node-wrapper:last-child::before { left: 0; width: 50%; }
      `}} />

      <div className="flex-shrink-0 p-4 shadow-sm bg-white border-b border-slate-200 flex justify-between items-center z-20 relative">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight italic">
          ANTIGRAVITY <span className="text-blue-600 not-italic">REALTIME</span>
        </h1>
        <div className="flex items-center gap-4">
          <button onClick={() => transformRef.current?.centerView(1, 300)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold text-sm shadow-lg transition-all active:scale-95">🏠</button>
          <div className="text-xs font-bold text-slate-400">● {isLoaded ? 'LIVE' : 'SYNCING'}</div>
        </div>
      </div>

      <div className="flex-1 relative bg-slate-600" style={{ backgroundImage: 'radial-gradient(#475569 2px, transparent 2px)', backgroundSize: '40px 40px' }}>
        {!isLoaded ? (
          <div className="h-full w-full flex items-center justify-center text-white font-black text-2xl animate-pulse tracking-widest bg-slate-800 z-50">SYNCING...</div>
        ) : (
          <TransformWrapper ref={transformRef} initialScale={1} centerOnInit={true} limitToBounds={false} doubleClick={{ disabled: true }} panning={{ excluded: ["input", "textarea", "select", "button", "no-pan"] }}>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "auto", height: "auto" }}>
              {/* 패딩을 줄이고 정중앙 배치를 위해 inline-flex 사용 */}
              <div className="p-[500px] inline-flex flex-col items-center">
                {renderTree(null)}
              </div>
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>
    </div>
  );
}
