# 深算 · AI-Powered Lottery Prediction

基于 DeepSeek 的双色球 / 大乐透开奖展示与预测静态站。  
从 [Double-Color-Ball-AI](https://github.com/) 重写：**仅 DeepSeek 单模型**，无多模型对比；页面视觉重做；数据经 GitHub Actions 自动更新。

## 自动化流水线

```
定时 Actions → 更新 JSON → push 到 GitHub
                 ↓
      （若已绑定）Vercel 检测到 push → 重新部署静态站
```

| 工作流 | 触发（北京时间） | 说明 |
|--------|------------------|------|
| Update SSQ Lottery Data | 每天 22:00 | 抓取双色球开奖 |
| Generate SSQ DeepSeek Prediction | 一 / 三 / 五 08:00 | 生成双色球 DeepSeek 预测 |
| Update DLT Lottery Data | 每天 22:30 | 抓取大乐透开奖 |
| Generate DLT DeepSeek Prediction | 二 / 四 / 日 08:00 | 生成大乐透 DeepSeek 预测 |

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
cp .env.example .env   # 填入 AI_API_KEY
python scripts/generate_ssq_prediction.py
python scripts/generate_dlt_prediction.py
```

## 数据文件

| 文件 | 用途 |
|------|------|
| `data/lottery_history.json` | 双色球历史开奖 |
| `data/ssq_predictions.json` | 双色球当期 DeepSeek 预测 |
| `data/ssq_predictions_history.json` | 双色球预测归档 |
| `data/sports_lottery_data.json` | 大乐透历史开奖 |
| `data/dlt_predictions.json` | 大乐透当期 DeepSeek 预测 |
| `data/dlt_predictions_history.json` | 大乐透预测归档 |

## 部署到 Vercel

1. 将本仓库推送到 GitHub  
2. 在 [Vercel](https://vercel.com) Import 该仓库（Framework：Other，输出根目录即可）  
3. 之后每次 Actions push 更新 `data/*.json`，Vercel 会自动重新部署  

`vercel.json` 已为 `/data/*` 设置 `must-revalidate`，避免旧 JSON 被长期缓存。

## 免责声明

本项目仅供娱乐与研究，不构成购彩建议。彩票开奖结果具有随机性。
