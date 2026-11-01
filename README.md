# 轨道工坊

基于 Three.js/WebGL 2 的交互式过山车设计与体验系统。它在浏览器本地运行，不需要后端。

## 运行

环境：Node.js 20.19+ 或 22.12+、npm、支持 WebGL 2 的 Chrome/Edge 等浏览器。

在项目根目录运行：

```powershell
npm install
npm run dev
```

打开终端显示的本地地址，通常为 `http://localhost:5173/`。构建提交版使用 `npm run build`，结果在 `dist/`。不要直接双击 `dist/index.html`；请通过本地 HTTP 服务打开。

## 使用

1. 选择轨道预设；在建造模式点击橙色节点，用三轴手柄拖动，或在左侧输入 X/Y/Z 坐标。
2. 添加或删除节点。相邻节点的水平距离至少 3 米，节点高 2～24 米，坡度上限为 0.9。
3. 点击「发车」。暂停后点击「继续」，编辑轨道后再次发车则从起点开始。
4. 切换自由观察、跟随小车和第一人称。可调整速度，打开重力模拟与高度着色。
   桌面场景右上角的高度剖面会随轨道编辑重画，圆点显示小车当前位置。
5. 用「导出 JSON」保存作品，之后用「导入」恢复。

## 文件

- `src/track.js`：曲线、局部坐标系、双轨网格、轨枕、支架、输入验证。
- `src/main.js`：场景、小车、拾取、控制点、相机、动画及界面交互。
- `src/style.css`：布局与响应式样式。
- `scripts/experiment.mjs`：参数移动与弧长移动的定量对比。
- `scripts/check-orientation.mjs`：验证车头、第一人称相机与轨道切线的方向一致性。
- `REPORT.md`：课程报告初稿与实验说明。

## 实验

运行 `node scripts/experiment.mjs`，可复现三种预设的速度均匀性比较，以及预览和完整轨道的双轨三角形数量。帧率受浏览器、显卡、窗口大小和设备像素比影响，请在实际演示设备上记录。

运行 `node scripts/check-orientation.mjs`，可检查三种预设的整圈车体朝向和轨枕姿态。

## 提交材料

- `REPORT.md`：课程报告，含实验结果与本机帧率记录。
- `submission/demo.mp4`：约 25 秒的完整网页操作演示，可用 Chrome、Edge 或常见视频播放器打开。
- `submission/preview.png`：演示画面预览。
- `submission/performance.json`：帧率逐次读数、浏览器和渲染设备信息。
