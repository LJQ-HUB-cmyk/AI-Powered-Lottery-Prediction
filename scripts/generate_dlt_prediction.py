# -*- coding: utf-8 -*-
"""大乐透 DeepSeek 预测生成脚本（单模型）"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

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
LOTTERY_HISTORY_FILE = os.path.join(ROOT, "data", "sports_lottery_data.json")
AI_PREDICTIONS_FILE = os.path.join(ROOT, "data", "dlt_predictions.json")
PREDICTIONS_HISTORY_FILE = os.path.join(ROOT, "data", "dlt_predictions_history.json")
PROMPT_FILE = os.path.join(ROOT, "doc", "dlt_prompt.md")


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_blue_balls(value: Any) -> List[str]:
    if isinstance(value, list):
        return sorted(str(item).zfill(2) for item in value)
    if isinstance(value, str) and value:
        return [str(value).zfill(2)]
    return []


def normalize_draw(draw: Dict[str, Any]) -> Dict[str, Any]:
    red_balls = sorted(str(item).zfill(2) for item in draw.get("red_balls", []))
    blue_balls = normalize_blue_balls(draw.get("blue_balls", draw.get("blue_ball")))
    return {**draw, "red_balls": red_balls, "blue_balls": blue_balls}


def extract_json_from_response(response_text: str) -> str:
    text = response_text.strip()
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        return text[start:end].strip()
    if "```" in text:
        start = text.find("```") + 3
        end = text.find("```", start)
        return text[start:end].strip()
    return text


def validate_prediction(prediction: Dict[str, Any]) -> bool:
    if len(prediction.get("predictions", [])) != 5:
        print("  预测组数量不正确")
        return False
    for group in prediction["predictions"]:
        red = [str(x).zfill(2) for x in group.get("red_balls", [])]
        blue = normalize_blue_balls(group.get("blue_balls", group.get("blue_ball")))
        if len(red) != 5 or len(blue) != 2:
            print("  前区/后区数量不正确")
            return False
        group["red_balls"] = sorted(red)
        group["blue_balls"] = blue
        group.pop("blue_ball", None)
    return True


def dlt_combo_key(group: Dict[str, Any]) -> tuple:
    reds = tuple(sorted(str(x).zfill(2) for x in group.get("red_balls", [])))
    blues = tuple(normalize_blue_balls(group.get("blue_balls", group.get("blue_ball"))))
    return reds, blues


def build_dlt_history_keys(draws: list) -> Dict[tuple, str]:
    keys: Dict[tuple, str] = {}
    for draw in draws or []:
        key = dlt_combo_key(normalize_draw(draw) if "blue_balls" in draw or "blue_ball" in draw else draw)
        keys.setdefault(key, str(draw.get("period", "")))
    return keys


def find_dlt_conflicts(groups: list, history_keys: Dict[tuple, str]) -> list:
    conflicts = []
    seen: Dict[tuple, int] = {}
    for group in groups:
        key = dlt_combo_key(group)
        gid = group.get("group_id", "?")
        if key in history_keys:
            conflicts.append(
                f"第{gid}组 {' '.join(key[0])}+{' '.join(key[1])} 与历史期 {history_keys[key]} 完全相同"
            )
        if key in seen:
            conflicts.append(f"第{gid}组 与第{seen[key]}组号码完全相同")
        else:
            seen[key] = gid
    return conflicts


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
    blue_hits = [b for b in group["blue_balls"] if b in actual.get("blue_balls", [])]
    return {
        "red_hits": red_hits,
        "red_hit_count": len(red_hits),
        "blue_hits": blue_hits,
        "blue_hit_count": len(blue_hits),
        "total_hits": len(red_hits) + len(blue_hits),
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

    actual = next(
        (normalize_draw(d) for d in lottery_data.get("data", []) if d.get("period") == old_target),
        None,
    )
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
        item["blue_balls"] = normalize_blue_balls(item.get("blue_balls", item.get("blue_ball")))
        item["hit_result"] = calculate_hit_result(item, actual)
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
    print("\n==== 大乐透 DeepSeek 预测 ====\n")
    with open(PROMPT_FILE, "r", encoding="utf-8") as f:
        prompt_template = f.read()

    lottery_data = load_json(LOTTERY_HISTORY_FILE)
    lottery_data["data"] = [normalize_draw(d) for d in lottery_data.get("data", [])]
    archive_old_prediction(lottery_data)

    next_draw = lottery_data.get("next_draw", {})
    target_period = next_draw.get("next_period", "")
    target_date = next_draw.get("next_date_display", "")
    if not target_period:
        print("无法获取下期期号")
        return None

    history_json = json.dumps((lottery_data.get("data") or [])[:30], ensure_ascii=False, indent=2)
    prediction_date = datetime.now().strftime("%Y-%m-%d")
    print(f"目标期号: {target_period}")
    print(f"开奖日期: {target_date}\n")

    history_keys = build_dlt_history_keys(lottery_data.get("data") or [])
    print(f"历史组合去重库: {len(history_keys)} 期\n")

    base_prompt = prompt_template.format(
        target_period=target_period,
        target_date=target_date,
        lottery_history=history_json,
        prediction_date=prediction_date,
        model_id=MODEL_ID,
        model_name=MODEL_NAME,
    )

    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    max_attempts = 3
    extra = ""
    prediction: Optional[Dict[str, Any]] = None

    for attempt in range(1, max_attempts + 1):
        prompt = base_prompt + extra
        print(f"尝试生成 {attempt}/{max_attempts} ...")
        try:
            prediction = call_deepseek(client, prompt)
        except Exception as exc:
            print(f"  调用失败: {exc}")
            continue

        prediction["prediction_date"] = prediction.get("prediction_date") or prediction_date
        prediction["target_period"] = prediction.get("target_period") or target_period
        prediction["model_id"] = MODEL_ID
        prediction["model_name"] = MODEL_NAME

        if not validate_prediction(prediction):
            print("  结构验证失败，重试")
            continue

        conflicts = find_dlt_conflicts(prediction["predictions"], history_keys)
        if not conflicts:
            print("  历史去重校验通过\n")
            break

        print("  发现与历史/组内重复：")
        for line in conflicts:
            print(f"    - {line}")
        banned = []
        for group in prediction["predictions"]:
            reds, blues = dlt_combo_key(group)
            banned.append(f"{' '.join(reds)} + {' '.join(blues)}")
        extra = (
            "\n\n## 去重重试约束\n"
            "上一版预测存在与历史完全相同或组内重复的号码，必须全部更换。\n"
            "禁止再次使用以下组合：\n"
            + "\n".join(f"- {item}" for item in banned)
            + "\n每组 5 前区 + 2 后区 必须是历史从未完整开出过的新组合。\n"
        )
        prediction = None
    else:
        prediction = None

    if not prediction:
        print("验证失败（含历史去重）")
        return None

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
