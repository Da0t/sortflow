import { ClassifyNode } from "./ClassifyNode";
import { FilterNode } from "./FilterNode";
import { MoveNode } from "./MoveNode";
import { WatchNode } from "./WatchNode";

export const nodeTypes = {
  watch: WatchNode,
  filter: FilterNode,
  classify: ClassifyNode,
  move: MoveNode,
};
