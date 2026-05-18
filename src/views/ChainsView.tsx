import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import { blue, mint, violet } from "../charts";
import { confidenceLabel, formatTime, sourceLabel } from "../format";
import { humanizeSkillName } from "../skillLabels";
import type { DashboardData, SkillCatalogItem, SkillChainEdge } from "../types";

interface ChainNode {
  id: string;
  name: string;
  displayName: string;
  source: string;
  calls: number;
  strength: number;
  degree: number;
}

interface SkillNetwork {
  id: string;
  title: string;
  subtitle: string;
  nodes: ChainNode[];
  edges: SkillChainEdge[];
  mass: number;
  color: string;
}

interface ForceNode extends ChainNode {
  x: number;
  y: number;
  radius: number;
  labelVisible: boolean;
  cluster: number;
}

interface ForceEdge extends SkillChainEdge {
  sourceNode: ForceNode;
  targetNode: ForceNode;
  width: number;
  opacity: number;
  label: string;
}

interface FocusLayout {
  nodes: ForceNode[];
  edges: ForceEdge[];
}

interface FocusSize {
  width: number;
  height: number;
}

type EdgeMode = "strong" | "balanced" | "dense";

interface ChainModel {
  nodes: ChainNode[];
  networks: SkillNetwork[];
  visibleEdges: SkillChainEdge[];
  tailNodes: ChainNode[];
  isolatedNodes: ChainNode[];
  displayNameByName: Map<string, string>;
  longestPath: string[];
  strongestEdge?: SkillChainEdge;
  bridgeNode?: ChainNode;
}

const FOCUS_WIDTH = 1280;
const FOCUS_HEIGHT = 720;
const CLUSTER_COLORS = ["#aee6bd", "#8ec5ff", "#b9a7ff", "#ffd28e", "#8fd8d2", "#f3a7c3", "#c7d690"];

export function ChainsView({ data }: { data: DashboardData }) {
  const model = useMemo(() => buildChainModel(data), [data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodeLimit, setNodeLimit] = useState(60);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("balanced");
  const selectedNetwork = model.networks.find((network) => network.id === selectedId) ?? model.networks[0];

  return (
    <div className="chain-view">
      <section className="surface notice">
        本页按 VOSviewer 共现网络读法处理：大小代表频次与链接强度，距离代表共现强度，颜色代表聚类；低频和未成链 Skill 不挤进主图。
      </section>

      <section className="chain-metrics">
        <MetricCard label="网络规模" value={`${model.nodes.length} / ${data.analytics.chains.length}`} detail="节点 / 链路" />
        <MetricCard
          label="最长链路"
          value={`${model.longestPath.length}`}
          detail={model.longestPath.map((name) => model.displayNameByName.get(name) ?? humanizeSkillName(name)).join(" -> ") || "暂无链路"}
        />
        <MetricCard
          label="最强链路"
          value={model.strongestEdge ? `${model.strongestEdge.weight}` : "0"}
          detail={model.strongestEdge ? displayEdge(model.strongestEdge, model.displayNameByName) : "暂无链路"}
        />
        <MetricCard
          label="桥接 Skill"
          value={model.bridgeNode?.degree.toString() ?? "0"}
          detail={model.bridgeNode ? `${model.bridgeNode.displayName} · ${model.bridgeNode.degree} 个邻居` : "暂无桥接节点"}
        />
      </section>

      <section className="surface network-overview-panel">
        <div className="section-heading">
          <h2>网络概览</h2>
          <p>只列出强共现网络，点击切换下方聚焦图。</p>
        </div>
        <div className="network-card-grid">
          {model.networks.slice(0, 8).map((network, index) => (
            <NetworkCard
              active={network.id === selectedNetwork?.id}
              key={network.id}
              network={network}
              onClick={() => setSelectedId(network.id)}
              rank={index + 1}
            />
          ))}
          {model.networks.length === 0 && <div className="empty-state">暂未推断出稳定 Skill 网络。</div>}
        </div>
      </section>

      {selectedNetwork ? (
        <FocusNetwork
          displayNameByName={model.displayNameByName}
          edgeMode={edgeMode}
          network={selectedNetwork}
          nodeLimit={nodeLimit}
          onEdgeMode={setEdgeMode}
          onNodeLimit={setNodeLimit}
        />
      ) : (
        <section className="surface focus-network-panel empty-state">没有可聚焦的网络。</section>
      )}

      <section className="surface filtered-tail-panel">
        <div className="section-heading">
          <h2>过滤说明</h2>
          <p>长尾不再进入主网络图，避免噪声破坏结构。</p>
        </div>
        <div className="filter-summary-grid">
          <div>
            <strong>{model.tailNodes.length.toLocaleString("zh-CN")}</strong>
            <span>低频链路节点</span>
            <p>有共现记录，但不属于头部强网络。</p>
          </div>
          <div>
            <strong>{model.isolatedNodes.length.toLocaleString("zh-CN")}</strong>
            <span>未成链 Skill</span>
            <p>当前没有稳定共现关系，只保留在统计和 Skill 库中。</p>
          </div>
          <div>
            <strong>{model.visibleEdges.length.toLocaleString("zh-CN")}</strong>
            <span>候选链路</span>
            <p>按强度过滤后进入网络识别。</p>
          </div>
        </div>
      </section>

      <section className="surface list-panel">
        <div className="section-heading">
          <h2>链接强度最高</h2>
          <p>按 Total Link Strength 思路识别常见组合。</p>
        </div>
        <div className="dense-list">
          {data.analytics.chains.slice(0, 14).map((edge) => (
            <div className="dense-row chain-row" key={`${edge.fromSkill}-${edge.toSkill}-${edge.confidence}`}>
              <div>
                <strong>{displayEdge(edge, model.displayNameByName)}</strong>
                <span>
                  {edge.fromSkill} {"->"} {edge.toSkill} · {confidenceLabel(edge.confidence)} · {edge.sessionCount} 个会话 · 最近 {formatTime(edge.lastSeen)}
                </span>
              </div>
              <b>{edge.weight}</b>
            </div>
          ))}
          {data.analytics.chains.length === 0 && <div className="empty-state">暂未推断出 Skill 链路。</div>}
        </div>
      </section>

      <section className="surface list-panel">
        <div className="section-heading">
          <h2>关键节点</h2>
          <p>调用量、邻居数和总链接强度综合排序。</p>
        </div>
        <div className="dense-list">
          {model.nodes
            .filter((node) => node.calls > 0 || node.strength > 0)
            .slice(0, 14)
            .map((node) => (
              <div className="dense-row chain-row" key={node.name}>
                <div>
                  <strong>{node.displayName}</strong>
                  <span>
                    {node.name} · {sourceLabel(node.source)} · {node.degree} 个邻居 · 总链接强度 {node.strength}
                  </span>
                </div>
                <b>{node.calls}</b>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function NetworkCard({
  network,
  active,
  onClick,
  rank,
}: {
  network: SkillNetwork;
  active: boolean;
  onClick: () => void;
  rank: number;
}) {
  const previewNodes = network.nodes.slice(0, 10);
  const maxScore = Math.max(1, ...previewNodes.map(nodeScore));

  return (
    <button className={`network-summary-card ${active ? "active" : ""}`} onClick={onClick} type="button">
      <span className="network-rank">{rank.toString().padStart(2, "0")}</span>
      <div>
        <strong>{network.title}</strong>
        <p>{network.subtitle}</p>
      </div>
      <div className="mini-network-row">
        {previewNodes.map((node) => (
          <span
            className="mini-network-dot"
            key={node.name}
            style={{
              backgroundColor: sourceColor(node.source),
              width: 5 + (nodeScore(node) / maxScore) * 19,
              height: 5 + (nodeScore(node) / maxScore) * 19,
            }}
            title={`${node.displayName}\n${node.name}`}
          />
        ))}
      </div>
    </button>
  );
}

function FocusNetwork({
  network,
  displayNameByName,
  nodeLimit,
  edgeMode,
  onNodeLimit,
  onEdgeMode,
}: {
  network: SkillNetwork;
  displayNameByName: Map<string, string>;
  nodeLimit: number;
  edgeMode: EdgeMode;
  onNodeLimit: (limit: number) => void;
  onEdgeMode: (mode: EdgeMode) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: string;
    start: { x: number; y: number };
    originals: Map<string, { x: number; y: number }>;
    influence: Map<string, number>;
  } | null>(null);
  const panRef = useRef<{
    start: { x: number; y: number };
    view: { x: number; y: number; zoom: number };
  } | null>(null);
  const [size, setSize] = useState<FocusSize>({ width: FOCUS_WIDTH, height: FOCUS_HEIGHT });
  const initialLayout = useMemo(
    () => layoutFocusNetwork(network, displayNameByName, nodeLimit, edgeMode, size),
    [network, displayNameByName, nodeLimit, edgeMode, size],
  );
  const [layout, setLayout] = useState<FocusLayout>(initialLayout);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observedElement = element;

    function updateSize() {
      const rect = observedElement.getBoundingClientRect();
      const next = {
        width: Math.max(760, Math.round(rect.width)),
        height: Math.max(520, Math.round(rect.height)),
      };
      setSize((current) => (current.width === next.width && current.height === next.height ? current : next));
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(observedElement);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setLayout(initialLayout);
    setView({ x: 0, y: 0, zoom: 1 });
  }, [initialLayout]);

  function svgPoint(event: PointerEvent<SVGSVGElement> | PointerEvent<SVGGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: size.width / 2, y: size.height / 2 };
    const rawX = ((event.clientX - rect.left) / rect.width) * size.width;
    const rawY = ((event.clientY - rect.top) / rect.height) * size.height;
    return {
      x: (rawX - view.x) / view.zoom,
      y: (rawY - view.y) / view.zoom,
    };
  }

  function rawSvgPoint(event: PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: size.width / 2, y: size.height / 2 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * size.width,
      y: ((event.clientY - rect.top) / rect.height) * size.height,
    };
  }

  function startPan(event: PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      start: rawSvgPoint(event),
      view,
    };
  }

  function startNodeDrag(node: ForceNode, event: PointerEvent<SVGGElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = svgPoint(event);
    dragRef.current = {
      id: node.name,
      start,
      originals: new Map(layout.nodes.map((item) => [item.name, { x: item.x, y: item.y }])),
      influence: buildDragInfluence(node.name, layout.edges),
    };
  }

  function moveNode(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) {
      const pan = panRef.current;
      if (!pan) return;
      const point = rawSvgPoint(event);
      setView({
        ...pan.view,
        x: pan.view.x + point.x - pan.start.x,
        y: pan.view.y + point.y - pan.start.y,
      });
      return;
    }
    const point = svgPoint(event);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    setLayout((current) => {
      const nodes = current.nodes.map((node) => {
        const original = drag.originals.get(node.name);
        const influence = drag.influence.get(node.name) ?? 0;
        if (!original || influence <= 0) return node;
        return {
          ...node,
          x: clamp(original.x + dx * influence, node.radius + 18, size.width - node.radius - 18),
          y: clamp(original.y + dy * influence, graphTopSafe(size) + node.radius, size.height - node.radius - 24),
        };
      });
      return { nodes, edges: reconnectEdges(current.edges, nodes) };
    });
  }

  function endNodeDrag() {
    dragRef.current = null;
    panRef.current = null;
  }

  function zoom(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    event.stopPropagation();
    const point = rawWheelPoint(event, size);
    setView((current) => {
      const next = clamp(current.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.52, 3.2);
      const worldX = (point.x - current.x) / current.zoom;
      const worldY = (point.y - current.y) / current.zoom;
      return {
        x: point.x - worldX * next,
        y: point.y - worldY * next,
        zoom: next,
      };
    });
  }

  return (
    <section className="surface focus-network-panel">
      <div className="focus-overlay">
        <div className="focus-header">
          <div>
            <h2>{network.title}</h2>
            <p>{network.subtitle} · 聚焦图仅显示该网络内的强关系。</p>
          </div>
          <div className="focus-stats">
            <span>
              显示 {layout.nodes.length}/{network.nodes.length} 节点
            </span>
            <span>
              链路 {layout.edges.length}/{network.edges.length}
            </span>
            <span>强度 {network.mass.toLocaleString("zh-CN")}</span>
          </div>
        </div>
        <div className="network-filter-bar">
          <div>
            <span>显示节点</span>
            {[30, 60, 90].map((limit) => (
              <button className={nodeLimit === limit ? "active" : ""} key={limit} onClick={() => onNodeLimit(limit)} type="button">
                核心 {limit}
              </button>
            ))}
          </div>
          <div>
            <span>链路密度</span>
            {([
              ["strong", "强"],
              ["balanced", "均衡"],
              ["dense", "密"],
            ] as const).map(([mode, label]) => (
              <button className={edgeMode === mode ? "active" : ""} key={mode} onClick={() => onEdgeMode(mode)} type="button">
                {label}
              </button>
            ))}
          </div>
          <span className="drag-hint">拖动节点会带动直接邻居，滚轮缩放</span>
          <button onClick={() => setLayout(initialLayout)} type="button">
            重置布局
          </button>
        </div>
      </div>
      <div className="focus-network-frame" ref={frameRef}>
        <svg
          className="focus-network-svg"
          onPointerDown={startPan}
          onPointerLeave={endNodeDrag}
          onPointerMove={moveNode}
          onPointerUp={endNodeDrag}
          onPointerCancel={endNodeDrag}
          onWheelCapture={zoom}
          ref={svgRef}
          viewBox={`0 0 ${size.width} ${size.height}`}
        >
          <defs>
            <filter id="focus-node-glow" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="7" />
              <feColorMatrix values="0 0 0 0 0.62 0 0 0 0 0.9 0 0 0 0 0.78 0 0 0 .5 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect className="focus-network-backdrop" height={size.height} width={size.width} />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            <g>
              {layout.edges.map((edge) => (
                <line
                  className="focus-edge"
                  key={`${edge.fromSkill}-${edge.toSkill}-${edge.confidence}`}
                  strokeWidth={edge.width}
                  style={{ opacity: edge.opacity }}
                  x1={edge.sourceNode.x}
                  x2={edge.targetNode.x}
                  y1={edge.sourceNode.y}
                  y2={edge.targetNode.y}
                >
                  <title>
                    {edge.label}
                    {"\n"}强度 {edge.weight}
                    {"\n"}{confidenceLabel(edge.confidence)}
                  </title>
                </line>
              ))}
            </g>
            <g>
              {layout.nodes.map((node) => (
                <g
                  className="focus-node-wrap"
                  key={node.name}
                  onPointerDown={(event) => startNodeDrag(node, event)}
                  transform={`translate(${node.x} ${node.y})`}
                >
                  <circle
                    className="focus-node"
                    fill={clusterColor(node.cluster)}
                    filter={node.radius > 18 ? "url(#focus-node-glow)" : undefined}
                    r={node.radius}
                  />
                  <title>
                    {node.displayName}
                    {"\n"}{node.name}
                    {"\n"}调用 {node.calls}
                    {"\n"}总链接强度 {node.strength}
                    {"\n"}邻居 {node.degree}
                  </title>
                  {node.labelVisible && (
                    <text className="focus-node-label" dy={node.radius + 14} textAnchor="middle">
                      {truncateLabel(node.displayName, 13)}
                    </text>
                  )}
                </g>
              ))}
            </g>
          </g>
        </svg>
      </div>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="surface chain-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function buildChainModel(data: DashboardData): ChainModel {
  const callsByName = new Map(data.summary.topSkills.map((skill) => [skill.name, skill.calls]));
  const catalogByName = new Map<string, SkillCatalogItem>();
  for (const skill of data.catalog) {
    const existing = catalogByName.get(skill.name);
    if (!existing || labelScore(skill) > labelScore(existing)) {
      catalogByName.set(skill.name, skill);
    }
  }

  const names = new Set<string>();
  for (const skill of data.catalog) names.add(skill.name);
  for (const skill of data.summary.topSkills) names.add(skill.name);
  for (const edge of data.analytics.chains) {
    names.add(edge.fromSkill);
    names.add(edge.toSkill);
  }

  const strength = new Map<string, number>();
  const neighbors = new Map<string, Set<string>>();
  for (const edge of data.analytics.chains) {
    strength.set(edge.fromSkill, (strength.get(edge.fromSkill) ?? 0) + edge.weight);
    strength.set(edge.toSkill, (strength.get(edge.toSkill) ?? 0) + edge.weight);
    if (!neighbors.has(edge.fromSkill)) neighbors.set(edge.fromSkill, new Set());
    if (!neighbors.has(edge.toSkill)) neighbors.set(edge.toSkill, new Set());
    neighbors.get(edge.fromSkill)?.add(edge.toSkill);
    neighbors.get(edge.toSkill)?.add(edge.fromSkill);
  }

  const nodes: ChainNode[] = [...names].map((name) => {
    const skill = catalogByName.get(name);
    return {
      id: name,
      name,
      displayName: skill?.localizedName || humanizeSkillName(skill?.displayName || name),
      source: skill?.source ?? "unknown",
      calls: callsByName.get(name) ?? 0,
      strength: strength.get(name) ?? 0,
      degree: neighbors.get(name)?.size ?? 0,
    };
  });
  nodes.sort((left, right) => nodeScore(right) - nodeScore(left) || left.name.localeCompare(right.name));

  const displayNameByName = new Map(nodes.map((node) => [node.name, node.displayName]));
  const visibleEdges = selectVisibleChains(data.analytics.chains, nodes);
  const networks = buildNetworks(nodes, visibleEdges);
  const networkNodeNames = new Set(networks.flatMap((network) => network.nodes.map((node) => node.name)));
  const tailNodes = nodes
    .filter((node) => !networkNodeNames.has(node.name) && (node.calls > 0 || node.strength > 0))
    .sort((left, right) => nodeScore(right) - nodeScore(left));
  const isolatedNodes = nodes
    .filter((node) => !networkNodeNames.has(node.name) && node.calls === 0 && node.strength === 0)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    nodes,
    networks,
    visibleEdges,
    tailNodes,
    isolatedNodes,
    displayNameByName,
    longestPath: longestConnectedPath(data.analytics.chains),
    strongestEdge: data.analytics.chains[0],
    bridgeNode: [...nodes]
      .filter((node) => node.degree > 0)
      .sort((left, right) => right.degree - left.degree || right.strength - left.strength || right.calls - left.calls)[0],
  };
}

function buildNetworks(nodes: ChainNode[], edges: SkillChainEdge[]) {
  const active = nodes.filter((node) => node.calls > 0 || node.strength > 0);
  const strongEdges = selectStrongChains(edges);
  const nodeByName = new Map(active.map((node) => [node.name, node]));
  const edgeByPair = new Map<string, SkillChainEdge[]>();
  const adjacency = new Map<string, Set<string>>();

  for (const edge of strongEdges) {
    if (!nodeByName.has(edge.fromSkill) || !nodeByName.has(edge.toSkill)) continue;
    if (!adjacency.has(edge.fromSkill)) adjacency.set(edge.fromSkill, new Set());
    if (!adjacency.has(edge.toSkill)) adjacency.set(edge.toSkill, new Set());
    adjacency.get(edge.fromSkill)?.add(edge.toSkill);
    adjacency.get(edge.toSkill)?.add(edge.fromSkill);
    const key = pairKey(edge.fromSkill, edge.toSkill);
    if (!edgeByPair.has(key)) edgeByPair.set(key, []);
    edgeByPair.get(key)?.push(edge);
  }

  const seen = new Set<string>();
  const networks: SkillNetwork[] = [];
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const queue = [start];
    const names: string[] = [];
    seen.add(start);
    for (let index = 0; index < queue.length; index += 1) {
      const name = queue[index];
      names.push(name);
      for (const next of adjacency.get(name) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }

    const componentNodes = names
      .map((name) => nodeByName.get(name))
      .filter(Boolean)
      .sort((left, right) => nodeScore(right as ChainNode) - nodeScore(left as ChainNode)) as ChainNode[];
    if (componentNodes.length < 2) continue;

    const componentSet = new Set(componentNodes.map((node) => node.name));
    const componentEdges = edges
      .filter((edge) => componentSet.has(edge.fromSkill) && componentSet.has(edge.toSkill))
      .sort((left, right) => right.weight - left.weight);
    const mass = componentNodes.reduce((sum, node) => sum + nodeScore(node), 0);
    const hub = componentNodes[0];
    networks.push({
      id: hub.name,
      title: hub.displayName,
      subtitle: `${componentNodes.length} 个节点 · ${componentEdges.length} 条链路 · 强度 ${mass.toLocaleString("zh-CN")}`,
      nodes: componentNodes,
      edges: componentEdges,
      mass,
      color: sourceColor(hub.source),
    });
  }

  return networks.sort((left, right) => right.mass - left.mass).slice(0, 10);
}

function layoutFocusNetwork(
  network: SkillNetwork,
  displayNameByName: Map<string, string>,
  nodeLimit: number,
  edgeMode: EdgeMode,
  size: FocusSize,
): FocusLayout {
  const maxCalls = Math.max(1, ...network.nodes.map((node) => node.calls));
  const maxStrength = Math.max(1, ...network.nodes.map((node) => node.strength));
  const maxWeight = Math.max(1, ...network.edges.map((edge) => edge.weight));
  const topSafe = graphTopSafe(size);
  const visibleNodes = network.nodes.slice(0, nodeLimit);
  const nodeNames = new Set(visibleNodes.map((node) => node.name));
  const edgeLimit = edgeMode === "strong" ? 48 : edgeMode === "balanced" ? 90 : 140;
  const links = network.edges
    .filter((edge) => nodeNames.has(edge.fromSkill) && nodeNames.has(edge.toSkill))
    .slice(0, edgeLimit)
    .map((edge) => ({
      ...edge,
      source: edge.fromSkill,
      target: edge.toSkill,
    }));
  const clusters = assignClusters(visibleNodes, links);
  const clusterCenters = clusterAnchorPoints(new Set(clusters.values()).size, size);
  const forceNodes: ForceNode[] = visibleNodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, visibleNodes.length);
    const cluster = clusters.get(node.name) ?? 0;
    const center = clusterCenters[cluster % clusterCenters.length];
    return {
      ...node,
      x: center.x + Math.cos(angle) * (36 + cluster * 5),
      y: center.y + Math.sin(angle) * (30 + cluster * 4),
      radius: radiusForNode(node, maxCalls, maxStrength, index === 0 ? 42 : 30, index === 0 ? 19 : 4.5),
      labelVisible: index < 12 || node.calls >= maxCalls * 0.35 || node.strength >= maxStrength * 0.35,
      cluster,
    };
  });
  const nodeByName = new Map(forceNodes.map((node) => [node.name, node]));

  const simulation = forceSimulation<ForceNode>(forceNodes)
    .force(
      "link",
      forceLink<ForceNode, SkillChainEdge & { source: string; target: string }>(links)
        .id((node) => node.name)
        .distance((edge) => Math.max(56, Math.min(size.width, size.height) * 0.21 - Math.min(170, Math.pow(edge.weight / maxWeight, 0.58) * 150)))
        .strength((edge) => 0.08 + Math.min(0.56, Math.pow(edge.weight / maxWeight, 0.82) * 0.5)),
    )
    .force("charge", forceManyBody<ForceNode>().strength((node) => -520 - node.radius * 38))
    .force("collide", forceCollide<ForceNode>().radius((node) => node.radius + (node.labelVisible ? 24 : 13)).strength(1))
    .force("x", forceX<ForceNode>((node) => clusterCenters[(node.cluster ?? 0) % clusterCenters.length].x).strength(0.075))
    .force("y", forceY<ForceNode>((node) => clusterCenters[(node.cluster ?? 0) % clusterCenters.length].y).strength(0.08))
    .stop();

  for (let index = 0; index < 360; index += 1) simulation.tick();

  for (const node of forceNodes) {
    node.x = clamp(node.x ?? size.width / 2, node.radius + 18, size.width - node.radius - 18);
    node.y = clamp(node.y ?? size.height / 2, topSafe + node.radius, size.height - node.radius - 24);
  }

  const edges: ForceEdge[] = links
    .map((edge) => {
      const source = typeof edge.source === "string" ? nodeByName.get(edge.source) : edge.source;
      const target = typeof edge.target === "string" ? nodeByName.get(edge.target) : edge.target;
      if (!source || !target) return null;
      const normalized = edge.weight / maxWeight;
      return {
        ...edge,
        fromSkill: edge.fromSkill,
        toSkill: edge.toSkill,
        sourceNode: source,
        targetNode: target,
        width: 0.6 + Math.pow(normalized, 0.68) * 5.8,
        opacity: 0.1 + Math.pow(normalized, 0.74) * 0.48,
        label: displayEdge(edge, displayNameByName),
      };
    })
    .filter(Boolean) as ForceEdge[];

  return { nodes: forceNodes, edges };
}

function assignClusters(nodes: ChainNode[], edges: Array<SkillChainEdge & { source: string; target: string }>) {
  const nodeNames = new Set(nodes.map((node) => node.name));
  const adjacency = new Map<string, Map<string, number>>();
  for (const node of nodes) adjacency.set(node.name, new Map());
  for (const edge of edges) {
    if (!nodeNames.has(edge.fromSkill) || !nodeNames.has(edge.toSkill)) continue;
    adjacency.get(edge.fromSkill)?.set(edge.toSkill, (adjacency.get(edge.fromSkill)?.get(edge.toSkill) ?? 0) + edge.weight);
    adjacency.get(edge.toSkill)?.set(edge.fromSkill, (adjacency.get(edge.toSkill)?.get(edge.fromSkill) ?? 0) + edge.weight);
  }

  const seedCount = Math.min(7, Math.max(1, Math.ceil(Math.sqrt(nodes.length / 5))));
  const seeds = pickClusterSeeds(nodes, edges, seedCount);
  const seedIndex = new Map(seeds.map((seed, index) => [seed.name, index]));
  const clusters = new Map<string, number>();

  for (const node of nodes) {
    if (seedIndex.has(node.name)) {
      clusters.set(node.name, seedIndex.get(node.name) ?? 0);
      continue;
    }

    let bestCluster = nodes.indexOf(node) % seedCount;
    let bestScore = -1;
    for (const [seedName, cluster] of seedIndex) {
      const direct = adjacency.get(node.name)?.get(seedName) ?? 0;
      let twoHop = 0;
      for (const [neighbor, weight] of adjacency.get(node.name) ?? []) {
        twoHop = Math.max(twoHop, weight * (adjacency.get(neighbor)?.get(seedName) ?? 0));
      }
      const score = direct * 1.4 + Math.sqrt(twoHop) * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    }
    clusters.set(node.name, bestScore > 0 ? bestCluster : nodes.indexOf(node) % seedCount);
  }

  return clusters;
}

function pickClusterSeeds(nodes: ChainNode[], edges: SkillChainEdge[], limit: number) {
  const selected: ChainNode[] = [];
  const weightByPair = new Map(edges.map((edge) => [pairKey(edge.fromSkill, edge.toSkill), edge.weight]));
  const maxWeight = Math.max(1, ...edges.map((edge) => edge.weight));
  for (const candidate of nodes) {
    const tooClose = selected.some((seed) => (weightByPair.get(pairKey(seed.name, candidate.name)) ?? 0) >= maxWeight * 0.3);
    if (!tooClose || selected.length === 0) selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected.length ? selected : nodes.slice(0, Math.max(1, limit));
}

function clusterAnchorPoints(count: number, size: FocusSize) {
  const actual = Math.max(1, count);
  const topSafe = graphTopSafe(size);
  const centerY = topSafe + (size.height - topSafe) / 2;
  if (actual === 1) return [{ x: size.width / 2, y: centerY }];
  const radiusX = size.width * 0.33;
  const radiusY = (size.height - topSafe) * 0.28;
  return Array.from({ length: actual }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / actual;
    return {
      x: size.width / 2 + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    };
  });
}

function graphTopSafe(size: FocusSize) {
  return Math.min(148, Math.max(92, size.height * 0.2));
}

function rawWheelPoint(event: WheelEvent<SVGSVGElement>, size: FocusSize) {
  const rect = event.currentTarget.getBoundingClientRect();
  if (!rect) return { x: size.width / 2, y: size.height / 2 };
  return {
    x: ((event.clientX - rect.left) / rect.width) * size.width,
    y: ((event.clientY - rect.top) / rect.height) * size.height,
  };
}

function buildDragInfluence(nodeName: string, edges: ForceEdge[]) {
  const maxWeight = Math.max(1, ...edges.map((edge) => edge.weight));
  const direct = new Map<string, number>();
  const second = new Map<string, number>();
  const neighbors = new Set<string>();
  direct.set(nodeName, 1);

  for (const edge of edges) {
    const other = edge.fromSkill === nodeName ? edge.toSkill : edge.toSkill === nodeName ? edge.fromSkill : "";
    if (!other) continue;
    neighbors.add(other);
    direct.set(other, Math.max(direct.get(other) ?? 0, 0.28 + (edge.weight / maxWeight) * 0.46));
  }

  for (const edge of edges) {
    const fromIsNeighbor = neighbors.has(edge.fromSkill);
    const toIsNeighbor = neighbors.has(edge.toSkill);
    if (fromIsNeighbor && edge.toSkill !== nodeName && !direct.has(edge.toSkill)) {
      second.set(edge.toSkill, Math.max(second.get(edge.toSkill) ?? 0, 0.14 + (edge.weight / maxWeight) * 0.16));
    }
    if (toIsNeighbor && edge.fromSkill !== nodeName && !direct.has(edge.fromSkill)) {
      second.set(edge.fromSkill, Math.max(second.get(edge.fromSkill) ?? 0, 0.14 + (edge.weight / maxWeight) * 0.16));
    }
  }

  for (const [name, weight] of second) direct.set(name, weight);
  return direct;
}

function reconnectEdges(edges: ForceEdge[], nodes: ForceNode[]) {
  const byName = new Map(nodes.map((node) => [node.name, node]));
  return edges.map((edge) => ({
    ...edge,
    sourceNode: byName.get(edge.fromSkill) ?? edge.sourceNode,
    targetNode: byName.get(edge.toSkill) ?? edge.targetNode,
  }));
}

function labelScore(skill: SkillCatalogItem) {
  return (skill.localizedName ? 100 : 0) + (skill.localizedNote ? 30 : 0) + (skill.description ? 10 : 0);
}

function nodeScore(node: ChainNode) {
  return node.calls * 4 + node.strength + node.degree * 2;
}

function radiusForNode(node: ChainNode, maxCalls: number, maxStrength: number, max: number, min: number) {
  const callMass = maxCalls ? node.calls / maxCalls : 0;
  const linkMass = maxStrength ? node.strength / maxStrength : 0;
  const mass = Math.max(0, callMass * 0.58 + linkMass * 0.42);
  return min + Math.pow(mass, 0.52) * (max - min);
}

function selectStrongChains(chains: SkillChainEdge[]) {
  const maxWeight = Math.max(1, ...chains.map((edge) => edge.weight));
  const threshold = Math.max(2, Math.ceil(maxWeight * 0.035));
  return chains.filter((edge) => edge.weight >= threshold).slice(0, 90);
}

function selectVisibleChains(chains: SkillChainEdge[], nodes: ChainNode[]) {
  const activeNames = new Set(nodes.filter((node) => node.calls > 0 || node.strength > 0).map((node) => node.name));
  const visible = new Map<string, SkillChainEdge>();
  const sorted = [...chains].sort((left, right) => right.weight - left.weight);
  const maxWeight = Math.max(1, ...sorted.map((edge) => edge.weight));
  const threshold = Math.max(2, Math.ceil(maxWeight * 0.018));

  for (const edge of sorted.filter((edge, index) => edge.weight >= threshold || index < 48).slice(0, 160)) {
    visible.set(edgeKey(edge), edge);
  }

  for (const name of [...activeNames].slice(0, 90)) {
    sorted
      .filter((edge) => edge.fromSkill === name || edge.toSkill === name)
      .filter((edge) => edge.weight >= threshold)
      .slice(0, 1)
      .forEach((edge) => visible.set(edgeKey(edge), edge));
  }

  return [...visible.values()].sort((left, right) => right.weight - left.weight);
}

function edgeKey(edge: SkillChainEdge) {
  return `${edge.fromSkill}\u0000${edge.toSkill}\u0000${edge.confidence}`;
}

function pairKey(left: string, right: string) {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function displayEdge(edge: SkillChainEdge, displayNameByName: Map<string, string>) {
  return `${displayNameByName.get(edge.fromSkill) ?? humanizeSkillName(edge.fromSkill)} -> ${displayNameByName.get(edge.toSkill) ?? humanizeSkillName(edge.toSkill)}`;
}

function truncateLabel(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function sourceColor(source: string) {
  if (source === "user") return mint;
  if (source === "agent") return "#aee6bd";
  if (source === "plugin") return blue;
  if (source === "system") return violet;
  return "rgba(255,255,255,.42)";
}

function clusterColor(cluster: number) {
  return CLUSTER_COLORS[cluster % CLUSTER_COLORS.length];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function longestConnectedPath(chains: SkillChainEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of chains) {
    if (!adjacency.has(edge.fromSkill)) adjacency.set(edge.fromSkill, new Set());
    if (!adjacency.has(edge.toSkill)) adjacency.set(edge.toSkill, new Set());
    adjacency.get(edge.fromSkill)?.add(edge.toSkill);
    adjacency.get(edge.toSkill)?.add(edge.fromSkill);
  }

  let bestPath: string[] = [];
  for (const node of adjacency.keys()) {
    const path = farthestPath(node, adjacency);
    if (path.length > bestPath.length) bestPath = path;
  }
  return bestPath;
}

function farthestPath(start: string, adjacency: Map<string, Set<string>>) {
  const queue = [start];
  const previous = new Map<string, string | null>([[start, null]]);
  let farthest = start;

  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    farthest = node;
    for (const next of adjacency.get(node) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, node);
      queue.push(next);
    }
  }

  const path: string[] = [];
  for (let node: string | null = farthest; node; node = previous.get(node) ?? null) {
    path.push(node);
  }
  return path.reverse();
}
