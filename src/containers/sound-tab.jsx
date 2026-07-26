import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {defineMessages, intlShape, injectIntl} from 'react-intl';
import VM from 'scratch-vm';

import AssetPanel from '../components/asset-panel/asset-panel.jsx';
import soundIcon from '../components/asset-panel/icon--sound.svg';
import soundIconRtl from '../components/asset-panel/icon--sound-rtl.svg';
import addSoundFromLibraryIcon from '../components/asset-panel/icon--add-sound-lib.svg';
import addSoundFromRecordingIcon from '../components/asset-panel/icon--add-sound-record.svg';
import fileUploadIcon from '../components/action-menu/icon--file-upload.svg';
import surpriseIcon from '../components/action-menu/icon--surprise.svg';
import searchIcon from '../components/action-menu/icon--search.svg';
import neteaseIcon from '../components/asset-panel/icon--netease.svg';

import RecordModal from './record-modal.jsx';
import SoundEditor from './sound-editor.jsx';
import SoundLibrary from './sound-library.jsx';
import SoundEditorNotSupported from '../components/tw-sound-editor-not-supported/sound-editor-not-supported.jsx';
import TwNeteaseSoundModal from '../components/tw-netease-sound-modal.jsx';

import {getSoundLibrary} from '../lib/libraries/tw-async-libraries';
import {handleFileUpload, soundUpload} from '../lib/file-uploader.js';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';
import DragConstants from '../lib/drag-constants';
import downloadBlob from '../lib/download-blob';
import SharedAudioContext from '../lib/audio/shared-audio-context.js';

import {connect} from 'react-redux';

import {
    closeSoundLibrary,
    openSoundLibrary,
    openSoundRecorder
} from '../reducers/modals';

import {
    activateTab,
    COSTUMES_TAB_INDEX
} from '../reducers/editor-tab';

import {setRestore} from '../reducers/restore-deletion';
import {showStandardAlert, closeAlertWithId} from '../reducers/alerts';

// 从网易云单曲链接解析出歌曲 id。支持：
//   https://music.163.com/song?id=123456
//   https://music.163.com/#/song?id=123456
//   https://music.163.com/song/123456
const parseNeteaseId = (link) => {
    try {
        let l = String(link).trim();
        const hashIdx = l.indexOf('#');
        if (hashIdx !== -1) {
            l = l.slice(hashIdx + 1);
        }
        const u = new URL(l, 'https://music.163.com');
        const id = u.searchParams.get('id');
        if (id) return id;
        const m = u.pathname.match(/\/song\/(\d+)/);
        if (m) return m[1];
    } catch (e) {
        // ignore
    }
    const m2 = String(link).match(/[?/]id=(\d+)/);
    if (m2) return m2[1];
    return null;
};

class SoundTab extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSelectSound',
            'handleDeleteSound',
            'handleDuplicateSound',
            'handleExportSound',
            'handleNewSound',
            'handleSurpriseSound',
            'handleFileUploadClick',
            'handleSoundUpload',
            'handleNeteaseClick',
            'handleNeteaseAdd',
            'handleDrop',
            'setFileInput'
        ]);
        this.state = {selectedSoundIndex: 0, neteaseModalOpen: false};
    }

    componentWillReceiveProps (nextProps) {
        const {
            editingTarget,
            sprites,
            stage
        } = nextProps;

        const target = editingTarget && sprites[editingTarget] ? sprites[editingTarget] : stage;
        if (!target || !target.sounds) {
            return;
        }

        // If switching editing targets, reset the sound index
        if (this.props.editingTarget !== editingTarget) {
            this.setState({selectedSoundIndex: 0});
        } else if (this.state.selectedSoundIndex > target.sounds.length - 1) {
            this.setState({selectedSoundIndex: Math.max(target.sounds.length - 1, 0)});
        }
    }

    handleSelectSound (soundIndex) {
        this.setState({selectedSoundIndex: soundIndex});
    }

    handleDeleteSound (soundIndex) {
        const restoreFun = this.props.vm.deleteSound(soundIndex);
        if (soundIndex >= this.state.selectedSoundIndex) {
            this.setState({selectedSoundIndex: Math.max(0, soundIndex - 1)});
        }
        this.props.dispatchUpdateRestore({restoreFun, deletedItem: 'Sound'});
    }

    handleExportSound (soundIndex) {
        const item = this.props.vm.editingTarget.sprite.sounds[soundIndex];
        const blob = new Blob([item.asset.data], {type: item.asset.assetType.contentType});
        downloadBlob(`${item.name}.${item.asset.dataFormat}`, blob);
    }

    handleDuplicateSound (soundIndex) {
        this.props.vm.duplicateSound(soundIndex).then(() => {
            this.setState({selectedSoundIndex: soundIndex + 1});
        });
    }

    handleNewSound () {
        if (!this.props.vm.editingTarget) {
            return null;
        }
        const sprite = this.props.vm.editingTarget.sprite;
        const sounds = sprite.sounds ? sprite.sounds : [];
        this.setState({selectedSoundIndex: Math.max(sounds.length - 1, 0)});
    }

    async handleSurpriseSound () {
        const soundLibraryContent = await getSoundLibrary();
        const soundItem = soundLibraryContent[Math.floor(Math.random() * soundLibraryContent.length)];
        const vmSound = {
            format: soundItem.dataFormat,
            md5: soundItem.md5ext,
            rate: soundItem.rate,
            sampleCount: soundItem.sampleCount,
            name: soundItem.name
        };
        this.props.vm.addSound(vmSound).then(() => {
            this.handleNewSound();
        });
    }

    handleFileUploadClick () {
        this.fileInput.click();
    }

    handleSoundUpload (e) {
        const storage = this.props.vm.runtime.storage;
        const targetId = this.props.vm.editingTarget.id;
        this.props.onShowImporting();
        handleFileUpload(e.target, (buffer, fileType, fileName, fileIndex, fileCount) => {
            soundUpload(buffer, fileType, storage, newSound => {
                newSound.name = fileName;
                this.props.vm.addSound(newSound, targetId).then(() => {
                    this.handleNewSound();
                    if (fileIndex === fileCount - 1) {
                        this.props.onCloseImporting();
                    }
                });
            }, this.props.onCloseImporting);
        }, this.props.onCloseImporting);
    }

    handleDrop (dropInfo) {
        if (dropInfo.dragType === DragConstants.SOUND) {
            const sprite = this.props.vm.editingTarget.sprite;
            const activeSound = sprite.sounds[this.state.selectedSoundIndex];

            this.props.vm.reorderSound(this.props.vm.editingTarget.id,
                dropInfo.index, dropInfo.newIndex);

            this.setState({selectedSoundIndex: sprite.sounds.indexOf(activeSound)});
        } else if (dropInfo.dragType === DragConstants.BACKPACK_COSTUME) {
            this.props.onActivateCostumesTab();
            this.props.vm.addCostume(dropInfo.payload.body, {
                name: dropInfo.payload.name
            });
        } else if (dropInfo.dragType === DragConstants.BACKPACK_SOUND) {
            this.props.vm.addSound({
                md5: dropInfo.payload.body,
                name: dropInfo.payload.name
            }).then(this.handleNewSound);
        }
    }

    setFileInput (input) {
        this.fileInput = input;
    }

    handleNeteaseClick () {
        this.setState({neteaseModalOpen: true});
    }

    // 从网易云单曲链接里解析出歌曲 id（支持标准链接与 #/hash 链接）
    async handleNeteaseAdd (link) {
        const songId = parseNeteaseId(link);
        if (!songId) {
            throw new Error('无法解析歌曲 ID，请确认是网易云单曲链接（需包含 id=数字）');
        }
        const vm = this.props.vm;
        const storage = vm.runtime.storage;
        const targetId = vm.editingTarget.id;

        this.props.onShowImporting();
        let name = `网易云_${songId}`;

        try {
            // 先尝试获取真实歌名（旧版未加密 detail 接口；失败则用兜底名）
            try {
                const dRes = await fetch(
                    `/proxy?url=${encodeURIComponent(
                        `https://music.163.com/api/song/detail/?id=${songId}&ids=%5B${songId}%5D`
                    )}&referer=${encodeURIComponent('https://music.163.com/')}`
                );
                if (dRes.ok) {
                    const d = await dRes.json();
                    if (d && d.songs && d.songs[0]) {
                        const s = d.songs[0];
                        name = s.name + (s.artists && s.artists[0] ? ` - ${s.artists[0].name}` : '');
                    }
                }
            } catch (e) {
                // 忽略，使用兜底名
            }

            // 真实下载音频并通过同源代理绕过跨域 + 提供 Referer
            const targetUrl = `https://music.163.com/song/media/outer/url?id=${songId}.mp3`;
            let res;
            try {
                res = await fetch(
                    `/proxy?url=${encodeURIComponent(targetUrl)}` +
                    `&referer=${encodeURIComponent('https://music.163.com/')}`
                );
            } catch (e) {
                throw new Error('下载歌曲失败：无法连接代理 /proxy（本地请重启 npm start；线上需部署 Cloudflare Pages Function）');
            }
            if (!res.ok) {
                let msg = `下载歌曲失败（HTTP ${res.status}）`;
                try {
                    const t = await res.text();
                    if (t) msg += `：${t.slice(0, 140)}`;
                } catch (e) { /* ignore */ }
                // 网易云版权歌曲/已下架常见表现：代理返回 502/404
                if (/music\.163\.com/.test(targetUrl) && (res.status === 502 || res.status === 404)) {
                    msg = '该网易云歌曲无法下载：多为版权歌曲需登录网易云账号，或歌曲已下架。' +
                        '建议：① 换一首免费歌曲再试；② 在网易云复制歌曲音频直链，用“上传声音”导入。';
                }
                throw new Error(msg);
            }
            const buf = await res.arrayBuffer();
            if (!buf || buf.byteLength < 1024) {
                throw new Error('下载到的内容不是有效音频，可能该歌曲需要登录或已下架');
            }

            await new Promise((resolve, reject) => {
                soundUpload(buf, 'audio/mpeg', storage, newSound => {
                    newSound.name = name;
                    vm.addSound(newSound, targetId)
                        .then(() => {
                            this.handleNewSound();
                            resolve();
                        })
                        .catch(reject);
                }, reject);
            });
        } finally {
            this.props.onCloseImporting();
        }
    }

    render () {
        const {
            dispatchUpdateRestore, // eslint-disable-line no-unused-vars
            intl,
            isRtl,
            vm,
            onNewSoundFromLibraryClick,
            onNewSoundFromRecordingClick
        } = this.props;

        if (!vm.editingTarget) {
            return null;
        }

        const isSupported = !!(vm.runtime.audioEngine && new SharedAudioContext());

        const sprite = vm.editingTarget.sprite;

        const sounds = sprite.sounds ? sprite.sounds.map(sound => (
            {
                url: isRtl ? soundIconRtl : soundIcon,
                name: sound.name,
                details: (sound.sampleCount / sound.rate).toFixed(2),
                dragPayload: sound
            }
        )) : [];

        const messages = defineMessages({
            fileUploadSound: {
                defaultMessage: 'Upload Sound',
                description: 'Button to upload sound from file in the editor tab',
                id: 'gui.soundTab.fileUploadSound'
            },
            surpriseSound: {
                defaultMessage: 'Surprise',
                description: 'Button to get a random sound in the editor tab',
                id: 'gui.soundTab.surpriseSound'
            },
            recordSound: {
                defaultMessage: 'Record',
                description: 'Button to record a sound in the editor tab',
                id: 'gui.soundTab.recordSound'
            },
            addSound: {
                defaultMessage: 'Choose a Sound',
                description: 'Button to add a sound in the editor tab',
                id: 'gui.soundTab.addSoundFromLibrary'
            },
            neteaseSound: {
                defaultMessage: '网易云歌曲',
                description: 'Button to add a sound from NetEase Cloud Music in the editor tab',
                id: 'gui.soundTab.neteaseSound'
            }
        });

        return (
            <AssetPanel
                buttons={isSupported ? [{
                    title: intl.formatMessage(messages.addSound),
                    img: addSoundFromLibraryIcon,
                    onClick: onNewSoundFromLibraryClick
                }, {
                    title: intl.formatMessage(messages.fileUploadSound),
                    img: fileUploadIcon,
                    onClick: this.handleFileUploadClick,
                    fileAccept: '.wav, .mp3, .ogg, .flac, .aac, .m4a',
                    fileChange: this.handleSoundUpload,
                    fileInput: this.setFileInput,
                    fileMultiple: true
                }, {
                    title: intl.formatMessage(messages.surpriseSound),
                    img: surpriseIcon,
                    onClick: this.handleSurpriseSound
                }, {
                    title: intl.formatMessage(messages.recordSound),
                    img: addSoundFromRecordingIcon,
                    onClick: onNewSoundFromRecordingClick
                }, {
                    title: intl.formatMessage(messages.addSound),
                    img: searchIcon,
                    onClick: onNewSoundFromLibraryClick
                }, {
                    title: intl.formatMessage(messages.neteaseSound),
                    img: neteaseIcon,
                    onClick: this.handleNeteaseClick
                }] : []}
                dragType={DragConstants.SOUND}
                isRtl={isRtl}
                items={sounds}
                selectedItemIndex={this.state.selectedSoundIndex}
                onDeleteClick={this.handleDeleteSound}
                onDrop={this.handleDrop}
                onDuplicateClick={this.handleDuplicateSound}
                onExportClick={this.handleExportSound}
                onItemClick={this.handleSelectSound}
            >
                {sprite.sounds && sprite.sounds[this.state.selectedSoundIndex] ? (
                    isSupported ? (
                        <SoundEditor soundIndex={this.state.selectedSoundIndex} />
                    ) : (
                        <SoundEditorNotSupported />
                    )
                ) : null}
                {this.props.soundRecorderVisible ? (
                    <RecordModal
                        onNewSound={this.handleNewSound}
                    />
                ) : null}
                {this.props.soundLibraryVisible ? (
                    <SoundLibrary
                        vm={this.props.vm}
                        onNewSound={this.handleNewSound}
                        onRequestClose={this.props.onRequestCloseSoundLibrary}
                    />
                ) : null}
                {this.state.neteaseModalOpen ? (
                    <TwNeteaseSoundModal
                        onClose={() => this.setState({neteaseModalOpen: false})}
                        onSubmit={this.handleNeteaseAdd}
                    />
                ) : null}
            </AssetPanel>
        );
    }
}

SoundTab.propTypes = {
    dispatchUpdateRestore: PropTypes.func,
    editingTarget: PropTypes.string,
    intl: intlShape,
    isRtl: PropTypes.bool,
    onActivateCostumesTab: PropTypes.func.isRequired,
    onCloseImporting: PropTypes.func.isRequired,
    onNewSoundFromLibraryClick: PropTypes.func.isRequired,
    onNewSoundFromRecordingClick: PropTypes.func.isRequired,
    onRequestCloseSoundLibrary: PropTypes.func.isRequired,
    onShowImporting: PropTypes.func.isRequired,
    soundLibraryVisible: PropTypes.bool,
    soundRecorderVisible: PropTypes.bool,
    sprites: PropTypes.shape({
        id: PropTypes.shape({
            sounds: PropTypes.arrayOf(PropTypes.shape({
                name: PropTypes.string.isRequired
            }))
        })
    }),
    stage: PropTypes.shape({
        sounds: PropTypes.arrayOf(PropTypes.shape({
            name: PropTypes.string.isRequired
        }))
    }),
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    editingTarget: state.scratchGui.targets.editingTarget,
    isRtl: state.locales.isRtl,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage,
    soundLibraryVisible: state.scratchGui.modals.soundLibrary,
    soundRecorderVisible: state.scratchGui.modals.soundRecorder
});

const mapDispatchToProps = dispatch => ({
    onActivateCostumesTab: () => dispatch(activateTab(COSTUMES_TAB_INDEX)),
    onNewSoundFromLibraryClick: e => {
        e.preventDefault();
        dispatch(openSoundLibrary());
    },
    onNewSoundFromRecordingClick: () => {
        dispatch(openSoundRecorder());
    },
    onRequestCloseSoundLibrary: () => {
        dispatch(closeSoundLibrary());
    },
    dispatchUpdateRestore: restoreState => {
        dispatch(setRestore(restoreState));
    },
    onCloseImporting: () => dispatch(closeAlertWithId('importingAsset')),
    onShowImporting: () => dispatch(showStandardAlert('importingAsset'))
});

export default errorBoundaryHOC('Sound Tab')(
    injectIntl(connect(
        mapStateToProps,
        mapDispatchToProps
    )(SoundTab))
);
