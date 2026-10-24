// Entirely fictional demonstration: a paper-boat museum on the Moon.
const kinds = ['起点', '问题', '输入', '摘录', '观察', '经历', '想法', '反思', '判断', '感悟', '行动', '方法', '结果', '反馈', '规则'];
const dates = ['2025-10-02','2025-10-08','2025-11-12','2025-12-20','2026-01-03','2026-01-10','2026-02-05','2026-02-28','2026-03-02','2026-03-18','2026-04-01','2026-04-23','2026-05-02','2026-05-18','2026-06-01','2026-06-17','2026-07-02','2026-07-20','2026-08-01','2026-08-18','2026-09-01','2026-09-17','2026-10-01','2026-10-03','2026-10-05','2026-10-08','2026-10-12','2026-10-15','2026-10-17','2026-10-18'];
const topics = [
  ['invest','虚构预算','BUDGET','月币纸船怎样定价？','陨石仓库怎样记账？'],
  ['ai','虚构机器人','ROBOTS','纸鹤机器人怎样认路？','云朵助手怎样提问？'],
  ['develop','虚构工坊','WORKSHOP','月球纸船馆怎样开放？','星砂灯怎样调亮？'],
  ['read','虚构阅读','READING','兔子图书馆怎样分类？','彗星故事怎样复述？'],
  ['life','虚构生活','LIFE','失重花园怎样浇水？','银河茶会怎样筹备？'],
];
const statuses = ['候选整理 · 待确认','正在探索','已有实际使用','规则待验证','个人认识','整理中的联系','已有研究记录','已发布过作品','正在探索','候选整理 · 待确认'];
let cursor = 0;
export const SAMPLE_THOUGHTS = {
  themes: topics.map(([id,label,en,a,b],t) => ({
    id, label: `示例：${label}`, en, code: String(t + 1).padStart(2,'0'),
    description: '示例：月球纸船馆的虚构演示主题，与真实人物和笔记无关。',
    latest: dates[Math.min(29, t * 6 + 5)], recordIds: [`demo-r${t + 1}`],
    ideas: [a,b].map((title,j) => {
      const n = t * 2 + j, count = n === 9 ? 0 : n < 3 ? 4 : 3;
      const nodes = Array.from({length:count},(_,s) => {
        const k = cursor++;
        return { id:`s${s+1}`, date:dates[k], kind:kinds[k % 15],
          title:`示例：纸船馆第 ${k+1} 次演示`,
          body:`示例：虚构馆长用第 ${k+1} 张星砂纸折出纸船，记录一次演示观察。此内容不代表真实经历。`,
          refs:[{id:k===29?'demo-missing':k%5===0?'demo-conversation':k%4===0?'demo-r1':`demo-r${k%8+1}`,quote:'示例：星砂纸仅用于虚构演示。'}],
          connection:k%4===0?'inferred':'recorded', link:s?'然后':'从这个问题开始' };
      });
      return {id:`${id}-demo-${j+1}`,title:`示例：${title}`,summary:n===1?'':'示例：先用纸船进行小规模演练，再核对月球馆长的假设。',status:statuses[n],updated:nodes.at(-1)?.date ?? '2026-10-18',nodes};
    }),
  })),
  sources:[{id:'demo-conversation',title:'示例：月球馆长对话',date:'2025-10-01',kind:'对话',origin:'演示',text:'示例：虚构馆长说，先记录纸船的重量，再决定展台大小。'}],
};
export const SAMPLE_BRAIN_DATA = {
  records:Array.from({length:8},(_,i)=>({id:`demo-r${i+1}`,date:`2026-0${i+1}-01 10:00:00`,title:`示例：第 ${i+1} 张月球便笺`,text:'示例：这是一条虚构的月球纸船馆原始记录。\n星砂不会真的发光。',tags:[`Demo/纸船馆/${i+1}`],domain:['invest','ai','develop','read','life'][i%5],related:[],origin:i%2?'obsidian':'flomo',kind:'个人记录'})),
};
export const SAMPLE_LESSONS = {
  lessons:Array.from({length:8},(_,i)=>({id:`demo-l${i+1}`,ideaId:SAMPLE_THOUGHTS.themes[Math.floor(i/2)].ideas[i%2].id,text:`示例：第 ${i+1} 条纸船经验，先演练再核对虚构假设。`,stepIds:['s1','s2'],status:i===0?'待确认':'confirmed',hasInference:i%2===0,patternIds:i>=6?[]:i===0?['demo-p1','demo-p2']:[i%2?'demo-p1':'demo-p2']})),
  patterns:[{id:'demo-p1',name:'示例：小纸船试航',description:'示例：用虚构的小实验检验假设。',level:'或曰',lessonIds:['demo-l1','demo-l2','demo-l4','demo-l6']},{id:'demo-p2',name:'示例：星砂留痕',description:'示例：让每次演练都保留可回看的依据。',level:'或曰',lessonIds:['demo-l1','demo-l3','demo-l5']}],
};
