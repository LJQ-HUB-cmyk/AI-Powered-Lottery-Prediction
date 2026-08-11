# 深算 · AI-Powered Lottery Prediction

基于 DeepSeek 的双色球 / 大乐透开奖展示与预测静态站。

## 在线访问

| 玩法 | 地址 |
|------|------|
| 双色球 | https://ai-powered-lottery-prediction-chi.vercel.app/index.html |
| 大乐透 | https://ai-powered-lottery-prediction-chi.vercel.app/dlt.html |
| 站点根路径 | https://ai-powered-lottery-prediction-chi.vercel.app/ |

## 功能概览

| 能力 | 说明 |
|------|------|
| 当期预测 | DeepSeek 按 5 组策略生成号码（热号 / 冷号 / 平衡 / 周期 / 综合） |
| 历史去重 | 预测整组号码不得与历史任一期**完全相同**，组间也不得重复；脚本对照全量历史校验，冲突最多重试 3 次 |
| 开奖后归档 | 目标期开奖后自动写入预测归档，并计算命中 |
| 图表分析 | 近 30 期红/蓝（前/后区）频率、命中走势、和值走势 |
| 历史查询 | 「历史回溯」支持按**期号**、**红球/前区**、**蓝球/后区**筛选；多条件 AND，匹配球高亮 |
| 全量开奖库 | 可按期号区间从 500 彩票网拉取全历史，写入 `data/*.json` |
| 双玩法页面 | `index.html` 双色球 · `dlt.html` 大乐透 |

### 历史查询用法

在页面「历史回溯」中：

- **期号**：完整或模糊，如 `26091`、`260`
- **红球 / 前区**：一个或多个号码，须**全部包含**才匹配，如 `05 14 18`
- **蓝球 / 后区**：同上，如 `05` 或大乐透 `02 09`
- 无筛选时默认展示最近 100 期；有条件时最多展示 500 条匹配结果

### 预测历史去重说明

去重对象是「整组开奖组合」（双色球 6 红 + 1 蓝 / 大乐透 5 前 + 2 后），不是单个号码。  
单个红蓝球在历史上几乎都会出现过，剔除单号在玩法上不成立。

## 自动化流水线

```
定时 Actions → 更新 JSON → push 到 GitHub
                 ↓
      （若已绑定）Vercel 检测到 push → 重新部署静态站
```

| 工作流 | 触发（北京时间） | 说明 |
|--------|------------------|------|
| Update SSQ Lottery Data | 每天 22:00 | 抓取双色球开奖 |
| Generate SSQ DeepSeek Prediction | 一 / 三 / 五 08:00 | 生成双色球 DeepSeek 预测（含历史去重） |
| Update DLT Lottery Data | 每天 22:30 | 抓取大乐透开奖 |
| Generate DLT DeepSeek Prediction | 二 / 四 / 日 08:00 | 生成大乐透 DeepSeek 预测（含历史去重） |

也可在 Actions 页手动 `workflow_dispatch`。

### 需要配置的 Secrets

仓库 Settings → Secrets and variables → Actions：

| Secret | 说明 |
|--------|------|
| `AI_API_KEY` | DeepSeek 或兼容网关的 API Key（必填） |
| `AI_BASE_URL` | 可选，默认 `https://api.deepseek.com`；也可用 aihubmix 等兼容地址 |
| `AI_MODEL` | 可选，默认 `deepseek-chat` |

## 本地预览

```bash
# Windows
start_server.bat

# macOS / Linux
chmod +x start_server.sh && ./start_server.sh
```

打开 http://localhost:8000 （双色球）或 http://localhost:8000/dlt.html （大乐透）。

本地生成预测：

```bash
pip install -r requirements.txt
cp .env.example .env   # 填入 AI_API_KEY；AI_BASE_URL 默认 https://api.deepseek.com
python scripts/generate_ssq_prediction.py
python scripts/generate_dlt_prediction.py
```

### 拉取 / 更新开奖数据

日常增量（Actions 同款，不传区间则用站点默认页）：

```bash
cd fetch_history
python fetch_lottery_history.py
python fetch_sports_lottery_history.py
```

全量历史（推荐首次或补全仓库时执行）：

```bash
cd fetch_history
# 双色球：约自 2003 年 03001 起
python fetch_lottery_history.py --start 03001 --end 26999
# 大乐透：约自 2007 年 07001 起
python fetch_sports_lottery_history.py --start 07001 --end 26999
```

脚本会按期号去重合并，并同步到 `data/lottery_history.json` / `data/sports_lottery_data.json`。

## 数据文件

| 文件 | 用途 |
|------|------|
| `data/lottery_history.json` | 双色球历史开奖（可含全量，约自 03001） |
| `data/ssq_predictions.json` | 双色球当期 DeepSeek 预测 |
| `data/ssq_predictions_history.json` | 双色球预测归档 |
| `data/sports_lottery_data.json` | 大乐透历史开奖（可含全量，约自 07001） |
| `data/dlt_predictions.json` | 大乐透当期 DeepSeek 预测 |
| `data/dlt_predictions_history.json` | 大乐透预测归档 |

预测脚本只会把**最近 30 期**注入 Prompt；全量历史用于页面查询与预测整组去重校验。

## 部署到 Vercel

线上环境：[https://ai-powered-lottery-prediction-chi.vercel.app/](https://ai-powered-lottery-prediction-chi.vercel.app/)

1. 将本仓库推送到 GitHub  
2. 在 [Vercel](https://vercel.com) Import 该仓库（Framework：Other，输出根目录即可）  
3. 之后每次 Actions push 更新 `data/*.json`，Vercel 会自动重新部署  

`vercel.json` 已为 `/data/*` 设置 `must-revalidate`，避免旧 JSON 被长期缓存。

## 免责声明

本项目仅供娱乐与研究，不构成购彩建议。彩票开奖结果具有随机性。
