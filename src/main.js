import { loadData } from './data/load.js';
import { buildModel } from './data/model.js';
import { todayKey } from './data/dates.js';

// 阶段 1 只验证数据启动链路，外壳与路由接入在阶段 2 实现。
buildModel(loadData(), { today: todayKey() });
