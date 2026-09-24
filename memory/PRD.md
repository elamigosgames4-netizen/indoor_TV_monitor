# PRD — MK Indoor Player

## Problema original
Aplicativo existente de mídia indoor para Android, usado em TV Weyon, outras TVs Android, TV Boxes, celulares e tablets. Interface em português, adaptada a toque e controle remoto. Pasta pública do Google Drive (via link tiny.cc ou link direto) = playlist automática (MP4/JPG/JPEG/PNG ordenados pelo nome), sem login Google nem chave de API no aparelho. Sincronização configurável com download persistente, reprodução durante downloads, ativação da nova playlist ao fim da mídia atual, manutenção da última playlist válida sem internet. Rotação fixa (0°, 90°, −90°, 180°) aplicada a fotos e vídeos. Autostart nativo no boot. Configurações completas do player e uma área adicional de Monitoramento com código da TV, URL editável, intervalo padrão de 20 segundos, persistência local e heartbeat POST JSON automático. O monitor não deve alterar vídeos, imagens, notícias ou Google Drive.

## Arquitetura
- **Frontend:** Expo (SDK 57, RN 0.86, expo-router) — player fullscreen (expo-video + expo-image), rotação por transform (TextureView), loop de fotos com timer, `playToEnd` para vídeos, watchdog de 15s, keep-awake, motor de sincronização cliente (`src/lib/sync.ts`), persistência (AsyncStorage via `src/utils/storage` + arquivos em `Paths.document/indoor-media`), bootstrap global do monitor (`src/lib/monitoring.ts`) com envio POST JSON e atualização ao retornar ao foreground.
- **Backend:** FastAPI (`/app/backend/server.py`) — `GET /api/drive/resolve?link=` segue redirecionamentos (tiny.cc 301/302/303), extrai o ID da pasta, lista arquivos via `embeddedfolderview` (sem API key), filtra por extensão, ordena naturalmente; cache em memória (45s) + última boa listagem no MongoDB como fallback.
- **Banco:** MongoDB (cache de resolução; futuramente batimentos dos aparelhos na Etapa 2).
- **Autostart nativo:** config plugin `plugins/withAutostart.js` (BootReceiver Kotlin + RECEIVE_BOOT_COMPLETED/WAKE_LOCK + LEANBACK_LAUNCHER; dispara deep link `indoorplayer://boot`). O player inicializa o monitor globalmente assim que o app abre no boot.

## Monitoramento — implementação (24/09/2026)
- A tela existente de configurações ganhou uma seção **Monitoramento**, sem nova tela nem alteração do fluxo do player.
- Código da TV começa vazio; URL inicial é `https://falacom.com.br/tv-monitor/api/heartbeat.php`; intervalo inicial é 20 segundos e aceita 5–3600 segundos.
- Configuração e último resultado do heartbeat ficam salvos localmente no aparelho.
- Payload POST JSON: `tv_code`, `status: "online"`, `timestamp` ISO-8601 e `app_version`.
- O serviço é iniciado no layout global, não depende da tela de monitoramento e é reiniciado após salvar novas configurações. O BootReceiver existente abre o app automaticamente junto com a TV.
- Crédito exibido na tela: **FEITO por Tiago Rodrigues 64 9 84468273**.
- Botão "Enviar teste agora" ao lado de "Salvar monitoramento" para disparar um heartbeat manual e ver sucesso/erro imediatamente.

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
Pasta=playlist automática; sem API key no aparelho; sincronização incremental; offline-first; rotação fixa salva; autostart nativo no boot; configuração por toque/controle; interface PT-BR; Android 7.0+; monitoramento local configurável com heartbeat POST JSON.

## Backlog
- **P0:** validar heartbeat em TV Weyon física, incluindo comportamento do fabricante quando o processo entra em background e confirmação do contrato da API remota.
- **P1:** painel de monitoramento protegido multi-aparelhos (nome, playlist, erros, último contato, "sem comunicação" após 2min).
- **P1:** validação em aparelho físico real (TV Weyon), ajustes de codec/D-pad por fabricante.
- **P2:** tela/ajustes extras de vídeo (brilho, volume fixo), múltiplas pastas.
