# F1 实际检查

仅本机脚本测试，不运行 API / Metro，不操作模拟器或用户数据。

node:test 5项 PASS：配置通过不代表公网/身份/数据库通过；拒绝非法origin；拒绝公网候选的受控账号与test tokens；拒绝路径/软链越界且不创建文件；CLI非零及秘密不输出。测试使用临时合成文件，不读个人库。

公网部署、DNS/TLS、持久卷、真实数据库迁移/恢复、真实 Apple、AASA、安装重开、双真机、VoiceOver、付费：NOT VERIFIED。配置预检 exit 0 不是 Phase F PASS。

本轮 npm run family-api:public-preflight:test（5 PASS）、改动脚本 eslint、tsc --noEmit、git diff --check PASS。缺配置 CLI 实跑 exit2、configChecksPassed=false；没有被当成错误部署。未重跑 App 全量 Jest，本切片没有修改运行页面或 API 逻辑。
