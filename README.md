# CS Academy 风格图编辑器中支持自环的版本

这是一个 TypeScript + Vite 编写的 Web UI 图编辑器。交互、布局与视觉参考 CS Academy 的 Graph Editor，并补上了原工具不支持的自环能力。

## 运行

先安装依赖：

    npm install

启动开发服务器：

    npm run dev

生产构建：

    npm run build

构建产物会写入 dist/，可用任意静态服务器托管。

## 功能

- 无向图 / 有向图切换
- 0-index、1-index、Custom Labels 三种标签模式
- Force、Draw、Edit、Delete、Config 五种工作模式
- 力导向布局，支持拖动节点、固定节点、树形整理
- 节点与边标签内联编辑
- 编辑 Graph Data 时保留原有空格、注释、空行和光标位置
- 边标签放在边的侧方，双向有向边标签自动分开
- 自环的曲线绘制、方向箭头、标签与多自环展开
- 图数据文本双向同步
- 撤销 / 重做
- 本地自动保存
- PNG 导出，支持 1x 到 4x 分辨率
- SVG 矢量导出

## 图数据格式

每行一个节点或一条边。

    A
    B
    A B
    A B 7
    A A
    A A loop

其中前三行分别创建节点 A、节点 B、边 A-B。第四行给边设置标签 7。第五行创建无标签自环，第六行创建带标签的自环。

也支持带引号的节点名。

## 自环操作

在 Draw 模式下：

1. 点击一个节点开始画边。
2. 再点击同一个节点，即可添加自环。
3. 点击空白画布可以取消待添加的边。

在 Graph Data 文本框中直接输入 u u 或 u u label 也可以添加自环。

## 导出

右侧的 Download as PNG 会把当前画布导出为白色背景 PNG，默认 2x 分辨率，可在 Config 模式调整。Download as SVG 导出矢量图，适合插入论文、题面和文档。

## 说明

CS Academy 原 Graph Editor 的解析器明确跳过 source == target 的边。本项目保留了原工具体验，同时重写了边解析、曲线几何和导出流程，使自环成为一等公民。
