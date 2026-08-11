# -*- coding: utf-8 -*-
"""双色球 DeepSeek 预测生成脚本（单模型）"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from openai import OpenAI

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

BASE_URL = os.environ.get("AI_BASE_URL") or "https://api.deepseek.com"
API_KEY = os.environ.get("AI_API_KEY") or os.environ.get("DEEPSEEK_API_KEY")
MODEL_ID = os.environ.get("AI_MODEL") or "deepseek-chat"
MODEL_NAME = "DeepSeek"

if not API_KEY:
    print("请设置环境变量 AI_API_KEY 或 DEEPSEEK_API_KEY")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR) if os.path.basename(SCRIPT_DIR) == "scripts" else SCRIPT_DIR
LOTTERY_HISTORY_FILE = os.path.join(ROOT, "data", "lottery_history.json")
AI_PREDICTIONS_FILE = os.path.join(ROOT, "data", "ssq_predictions.json")
PREDICTIONS_HISTORY_FILE = os.path.join(ROOT, "data", "ssq_predictions_history.json")
PROMPT_FILE = os.path.join(ROOT, "doc", "ssq_prompt.md")


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_prompt_template() -> str:
    with open(PROMPT_FILE, "r", encoding="utf-8") as f:
        return f.read()


def get_next_draw_date() -> str:
    today = datetime.now()
    weekday = today.weekday()
    draw_weekdays = [1, 3, 6]
    if weekday in draw_weekdays:
        draw_time = today.replace(hour=21, minute=15, second=0, microsecond=0)
        if today < draw_time:
            return today.strftime("%Y-%m-%d")
    for days_ahead in range(1, 8):
        future = today + timedelta(days=days_ahead)
        if future.weekday() in draw_weekdays:
            return future.strftime("%Y-%m-%d")
    return today.strftime("%Y-%m-%d")


def extract_json_from_response(response_text: str) -> str:
    text = response_text.strip()
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        text = text[start:end].strip()
    elif "```" in text:
        start = text.find("```") + 3
        end = text.find("```", start)
        text = text[start:end].strip()
    return text


def validate_prediction(prediction: Dict[str, Any]) -> bool:
    required = ["prediction_date", "target_period", "model_id", "model_name", "predictions"]
    for field in required:
        if field not in prediction:
            print(f"  缺少字段: {field}")
            return False
    if len(prediction["predictions"]) != 5:
        print(f"  预测组数量不正确: {len(prediction['predictions'])}")
        return False
    for group in prediction["predictions"]:
        if len(group.get("red_balls", [])) != 6:
            print("  红球数量不正确")
            return False
        group["red_balls"] = sorted(str(x).zfill(2) for x in group["red_balls"])
        group["blue_ball"] = str(group.get("blue_ball", "")).zfill(2)
        if not group["blue_ball"]:
            print("  蓝球为空")
            return False
    return True


def call_deepseek(client: OpenAI, prompt: str) -> Dict[str, Any]:
    print(f"  正在调用 {MODEL_NAME} ({MODEL_ID})...")
    response = client.chat.completions.create(
        model=MODEL_ID,
        messages=[
            {
                "role": "system",
                "content": "你是专业的彩票数据分析师。请严格返回 JSON，不要附加解释。",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.8,
    )
    raw = response.choices[0].message.content or ""
    data = json.loads(extract_json_from_response(raw))
    print(f"  {MODEL_NAME} 预测成功")
    return data


def calculate_hit_result(group: Dict[str, Any], actual: Dict[str, Any]) -> Dict[str, Any]:
    red_hits = [b for b in group["red_balls"] if b in actual["red_balls"]]
    blue_hit = group["blue_ball"] == actual["blue_ball"]
    return {
        "red_hits": red_hits,
        "red_hit_count": len(red_hits),
        "blue_hit": blue_hit,
        "total_hits": len(red_hits) + (1 if blue_hit else 0),
    }


def archive_old_prediction(lottery_data: Dict[str, Any]) -> None:
    if not os.path.exists(AI_PREDICTIONS_FILE):
        print("  没有旧预测需要归档\n")
        return

    old = load_json(AI_PREDICTIONS_FILE)
    old_target = old.get("target_period")
    if not old_target:
        return

    latest_period = (lottery_data.get("data") or [{}])[0].get("period")
    if not latest_period or int(old_target) > int(latest_period):
        print(f"  旧预测期号 {old_target} 尚未开奖，无需归档\n")
        return

    actual = next((d for d in lottery_data.get("data", []) if d.get("period") == old_target), None)
    if not actual:
        print(f"  找不到期号 {old_target} 的开奖结果，跳过归档\n")
        return

    history = {"predictions_history": []}
    if os.path.exists(PREDICTIONS_HISTORY_FILE):
        history = load_json(PREDICTIONS_HISTORY_FILE)

    if any(r.get("target_period") == old_target for r in history.get("predictions_history", [])):
        print(f"  期号 {old_target} 已存在于历史记录中\n")
        return

    groups = []
    for pred in old.get("predictions", []):
        item = dict(pred)
        item["hit_result"] = calculate_hit_result(pred, actual)
        groups.append(item)

    best = max(groups, key=lambda p: p["hit_result"]["total_hits"]) if groups else None
    record = {
        "prediction_date": old.get("prediction_date"),
        "target_period": old_target,
        "actual_result": actual,
        "model_id": old.get("model_id", MODEL_ID),
        "model_name": old.get("model_name", MODEL_NAME),
        "predictions": groups,
        "best_group": best["group_id"] if best else None,
        "best_hit_count": best["hit_result"]["total_hits"] if best else 0,
    }
    history.setdefault("predictions_history", []).insert(0, record)
    save_json(PREDICTIONS_HISTORY_FILE, history)
    print(f"  已归档期号 {old_target}\n")


def generate_prediction() -> Optional[Dict[str, Any]]:
    print("\n==== 双色球 DeepSeek 预测 ====\n")
    prompt_template = load_prompt_template()
    lottery_data = load_json(LOTTERY_HISTORY_FILE)
    archive_old_prediction(lottery_data)

    next_draw = lottery_data.get("next_draw", {})
    target_period = next_draw.get("next_period", "")
    target_date = next_draw.get("next_date_display", "")
    if not target_period:
        print("无法获取下期期号")
        return None

    history_json = json.dumps((lottery_data.get("data") or [])[:30], ensure_ascii=False, indent=2)
    prediction_date = get_next_draw_date()
    print(f"目标期号: {target_period}")
    print(f"开奖日期: {target_date}")
    print(f"预测日期: {prediction_date}\n")

    prompt = prompt_template.format(
        target_period=target_period,
        target_date=target_date,
        lottery_history=history_json,
        prediction_date=prediction_date,
        model_id=MODEL_ID,
        model_name=MODEL_NAME,
    )

    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    prediction = call_deepseek(client, prompt)
    prediction["prediction_date"] = prediction.get("prediction_date") or prediction_date
    prediction["target_period"] = prediction.get("target_period") or target_period
    prediction["model_id"] = MODEL_ID
    prediction["model_name"] = MODEL_NAME

    if not validate_prediction(prediction):
        print("验证失败")
        return None

    # flatten: store single-model schema (not models[])
    return {
        "prediction_date": prediction["prediction_date"],
        "target_period": prediction["target_period"],
        "model_id": MODEL_ID,
        "model_name": MODEL_NAME,
        "predictions": prediction["predictions"],
    }


def main() -> None:
    result = generate_prediction()
    if not result:
        print("预测生成失败")
        sys.exit(1)

    if os.path.exists(AI_PREDICTIONS_FILE):
        backup = AI_PREDICTIONS_FILE.replace(
            ".json", f"_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
        save_json(backup, load_json(AI_PREDICTIONS_FILE))
        print(f"已备份: {os.path.basename(backup)}")

    save_json(AI_PREDICTIONS_FILE, result)
    print(f"已保存: {AI_PREDICTIONS_FILE}")
    print(f"期号 {result['target_period']} · 共 {len(result['predictions'])} 组\n")


if __name__ == "__main__":
    main()
