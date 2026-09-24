# PRD — MK Indoor Player

## Problema original
Criar do zero um aplicativo de mídia indoor para Android, inspirado no MK Indoor. Solução simples, funcional e econômica. APK para TV Weyon, outras TVs Android, TV Boxes, celulares e tablets. Interface em português, adaptada a toque e controle remoto. Pasta pública do Google Drive (via link tiny.cc ou link direto) = playlist automática (MP4/JPG/JPEG/PNG ordenados pelo nome), sem login Google nem chave de API no aparelho. Sincronização a cada 60s com download persistente, reprodução durante downloads, ativação da nova playlist ao fim da mídia atual, manutenção da última playlist válida sem internet. Rotação fixa (0°, 90°, −90°, 180°) aplicada a fotos e vídeos. Autostart nativo no boot. Configurações completas (nome do aparelho, link, duração das fotos, rotação, autostart, Salvar e reproduzir, Atualizar agora, última sincronização e erros). Monitoramento multi-aparelhos como Etapa 2 (painel protegido, batimento a cada 60s, "sem comunicação" após 2min). Sem landing page, IA, pagamentos ou extras.

## Arquitetura
- **Frontend:** Expo (SDK 57, RN 0.86, expo-router) — player fullscreen (expo-video + expo-image), rotação por transform (TextureView), loop de fotos com timer, `playToEnd` para vídeos, watchdog de 15s, keep-awake, motor de sincronização cliente (`src/lib/sync.ts`), persistência (AsyncStorage via `src/utils/storage` + arquivos em `Paths.document/indoor-media`).
- **Backend:** FastAPI (`/app/backend/server.py`) — `GET /api/drive/resolve?link=` segue redirecionamentos (tiny.cc 301/302/303), extrai o ID da pasta, lista arquivos via `embeddedfolderview` (sem API key), filtra por extensão, ordena naturalmente; cache em memória (45s) + última boa listagem no MongoDB como fallback.
- **Banco:** MongoDB (cache de resolução; futuramente batimentos dos aparelhos na Etapa 2).
- **Autostart nativo:** config plugin `plugins/withAutostart.js` (BootReceiver Kotlin + RECEIVE_BOOT_COMPLETED/WAKE_LOCK + LEANBACK_LAUNCHER; dispara deep link `indoorplayer://boot`).

## Ajustes (22/09/2026 — parte 3)
- **Intervalo de verificação configurável em minutos:** novo campo "Verificar novos arquivos a cada (minutos)" (`syncIntervalMin`, padrão 1, faixa 1–1440). O timer de sincronização do player usa esse valor no lugar do fixo de 60s.
- **Continuidade da fila:** ao ativar uma nova playlist (arquivos novos), o player continua a partir do item **seguinte ao que acabou de tocar**, em vez de voltar ao primeiro — a fila cresce sem interromper o vídeo atual. Loop contínuo mantido (após o último, volta ao primeiro).

## Correções (22/09/2026)
- **Tela preta no vídeo (Android):** `expo-video` usa `SurfaceView` por padrão, que não respeita o transform de rotação e renderiza preto dentro da view rotacionada. Corrigido com `surfaceType="textureView"` + `useExoShutter={false}` em `VideoItem.tsx`.
- **Multi-TV com links diferentes:** cada aparelho guarda o próprio link/config localmente (AsyncStorage); basta instalar o APK em cada TV e configurar um link diferente por aparelho — já funciona por design.

## Tarefas concluídas (22/09/2026)
- Validação prévia da integração Drive: listagem real sem API key (embeddedfolderview), download real (HTTP 200, vídeo 883MB com range 206), redirect tiny.cc 303, TextureView do expo-video (rotação viável). APK: build via Publish (EAS); compilação local indisponível no container — avisado ao usuário.
- Backend: resolve de pasta (tiny.cc → Drive), filtro MP4/JPG/JPEG/PNG, ordenação natural, cache memória+Mongo, health check.
- Player: loop contínuo em tela cheia (vídeos completos + fotos 10s configuráveis), sem deformar (contain), overlay de status com acesso a configurações por toque/controle, back não sai do app, tela sempre ativa.
- Sincronização: diff por (nome → fileId — substituição no Drive muda o fileId, detectando mudança de conteúdo), download só do novo/modificado, playlist pendente ativada ao fim da mídia atual, última playlist válida em falha/offline, recuperação ao reabrir.
- Configurações: nome, link, duração das fotos, rotação exata (0°/90°/−90°/180°), autostart, Salvar e reproduzir (valida o link antes de salvar), Atualizar agora, última sincronização e erros.
- RotatedMedia: troca largura/altura + rotate para 90/−90/180 sem cortar/deformar.

## Personas
- **Lojista/Público:** vê a playlist rodando em loop na TV da loja.
- **Gestor de conteúdo:** joga arquivos numa pasta do Drive; o aparelho se atualiza sozinho.

## Requisitos principais (estáticos)
Pasta=playlist automática; sem API key no aparelho; sincronização 60s incremental; offline-first; rotação fixa salva; autostart nativo no boot; configuração por toque/controle; interface PT-BR; Android 7.0+.

## Backlog
- **P0 (Etapa 2):** painel de monitoramento protegido multi-aparelhos (batimento 60s, nome, playlist, erros, último contato, "sem comunicação" após 2min).
- **P1:** validação em aparelho físico real (TV Weyon), ajustes de codec/D-pad por fabricante.
- **P2:** tela/ajustes extras de vídeo (brilho, volume fixo), múltiplas pastas.
