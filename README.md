<div align="center">

# 🎮 Modpack Analyzer PRO

**Инструмент для анализа и редактирования Minecraft-сборок**

[![Version](https://img.shields.io/badge/version-0.1.0-4ade80?style=flat-square)](https://github.com/gr3ml1nchanin/modpack-analyzer-pro/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-4fd1e8?style=flat-square)]()
[![Electron](https://img.shields.io/badge/Electron-30+-a855f7?style=flat-square)](https://electronjs.org)
[![License](https://img.shields.io/badge/license-MIT-fbbf24?style=flat-square)](LICENSE)

[Русский](#-русский) · [English](#-english) · [Releases](https://github.com/gr3ml1nchanin/modpack-analyzer-pro/releases)

</div>

---

## 🇷🇺 Русский

### Что это

**Modpack Analyzer PRO** — десктопное приложение для анализа, диагностики и редактирования Minecraft-сборок. Работает с любой сборкой на Forge / Fabric / NeoForge / Quilt: читает JAR-файлы напрямую, показывает конфликты, помогает править рецепты, лут и конфиги — без ручного копания в папках.

**Автор:** [gr3ml1](https://github.com/gr3ml1nchanin) · **Версия:** 0.1.0 · **Лицензия:** MIT

---

### ✨ Возможности

| Раздел | Что делает |
|--------|-----------|
| 📊 **Обзор** | Статистика сборки: количество модов, размеры, распределение по загрузчикам, прогноз RAM |
| 📦 **Моды** | Полный список JAR: ID, версия, тип (клиентский / серверный / библиотека / метамод), авторы, зависимости, размер |
| 🛠️ **Рецепты** | Просмотр и редактирование крафтов прямо из JAR. Визуальная сетка 3×3, автокомплит предметов и тегов, экспорт в KubeJS |
| 💎 **Лут** | Таблицы дропа с блоков, мобов и из сундуков (включая ванильные). Редактор с шансами, количеством и условиями |
| 🕸️ **Граф** | Интерактивная визуализация зависимостей: обычные связи, дубликаты, отсутствующие моды, хаб-библиотеки. Zoom, pan, drag узлов |
| ⚙️ **Конфиги** | Двухрежимный редактор `.toml`, `.json`, `.properties`, `.yaml`: GUI (слайдеры, чекбоксы, dropdown'ы) + сырой текст с сохранением комментариев |
| 📜 **Логи** | Просмотр логов и crash-reports с подсветкой по уровню. Анализ ошибок через правило «5 почему» |
| 🎒 **Предметы** | Импорт `item-name.txt` для автокомплита в редакторах |
| 📖 **О модах** | Карточка каждого мода: предметы, блоки, мобы, биомы, структуры, локализация, рецепты |
| 🔍 **Анализ** | Поиск дубликатов, отсутствующих зависимостей, пустых конфигов, мусора и устаревших логов |

---

### 🚀 Установка

#### Вариант 1: Готовая сборка (для пользователей)

1. Скачай последний релиз со страницы [Releases](https://github.com/gr3ml1nchanin/modpack-analyzer-pro/releases)
2. Запусти `ModpackAnalyzerPRO-0.1.0-portable.exe` — установка не требуется
3. Или запусти `ModpackAnalyzerPRO-0.1.0-setup.exe` для установки с ярлыком

#### Вариант 2: Из исходников (для разработчиков)

```bash
# Клонировать репозиторий
git clone https://github.com/gr3ml1nchanin/modpack-analyzer-pro.git
cd modpack-analyzer-pro

# Установить зависимости
npm install

# Запустить в режиме разработки
npm start

# Собрать .exe
npm run build
