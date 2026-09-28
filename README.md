# rolefail

浏览器控制台（原生 ES 模块，零依赖）：左边操作面板、右边可视化区，可逐步执行、可改参数、可重新载入场景。

## 起服务看页面

    python3 -m http.server 8000

浏览器打开 http://127.0.0.1:8000/ ，按面板上的按钮操作，结果直接画在右边。

## 测试

    node tests/run.js

## 场景自检

    node check_sample.js
