<?php
if(isset($_GET['echostr'])){
	echo $_GET['echostr'];exit;
}

if(!defined('ABSPATH')){
	include('../../../../wp-load.php');
}

remove_filter('the_title', 'convert_chars');

try {
	include WEIXIN_ROBOT_PLUGIN_DIR.'public/weixin-reply.php';

	global $wechatObj, $weixin_reply;

	define('DOING_WEIXIN_REPLY', true);

	// 如果是在被动响应微信消息，和微信用户界面中，设置 is_home 为 false，
	add_action('parse_query',function($query){	
		$query->is_home 	= false;
		$query->is_search 	= false;
		$query->is_weixin 	= true;
	});

	add_filter('wpjam_current_user',	['WEIXIN_Extend', 'filter_current_user']);

	$weixin_appid	= weixin_get_appid();
	if (!$weixin_appid) {
		throw new Exception('微信公众号配置错误：AppID为空');
	}

	$weixin_setting	= weixin_get_setting();
	if (empty($weixin_setting) || !is_array($weixin_setting)) {
		throw new Exception('微信公众号配置错误：设置数据无效');
	}

	if (!isset($weixin_setting['weixin_token'])) {
		throw new Exception('微信公众号配置错误：Token未设置');
	}

	if(!defined('WEIXIN_SEARCH')) {
		define('WEIXIN_SEARCH', $weixin_setting['weixin_search'] ?? false);
	}

	$weixin_reply	= new WEIXIN_Reply($weixin_appid, $weixin_setting['weixin_token'], $weixin_setting['weixin_encodingAESKey'] ?? '');
	$wechatObj		= $weixin_reply; // 兼容
} catch (Exception $e) {
	// 记录错误并返回友好的错误信息
	error_log('微信机器人错误: ' . $e->getMessage());
	if (defined('WP_DEBUG') && WP_DEBUG) {
		wp_die('微信机器人错误: ' . $e->getMessage());
	} else {
		wp_die('微信服务暂时不可用，请稍后再试。');
	}
} catch (Error $e) {
	// 捕获PHP 7+的错误
	error_log('微信机器人致命错误: ' . $e->getMessage());
	if (defined('WP_DEBUG') && WP_DEBUG) {
		wp_die('微信机器人致命错误: ' . $e->getMessage());
	} else {
		wp_die('微信服务暂时不可用，请稍后再试。');
	}
}

if(isset($_GET['debug'])){
	try {
		$keyword	= strtolower(trim(wpjam_get_parameter('t')));
		$weixin_reply->set_keyword($keyword);
		$result	= $weixin_reply->response_msg();
	} catch (Exception $e) {
		error_log('微信调试模式错误: ' . $e->getMessage());
		if (defined('WP_DEBUG') && WP_DEBUG) {
			wp_die('微信调试模式错误: ' . $e->getMessage());
		} else {
			wp_die('调试模式出错，请检查配置。');
		}
	}
}else{
	try {
	$result	= $weixin_reply->verify_msg();

	if($result){
		if($result !== true){
			echo $result;
			exit;
		}
	}else{
		echo ' ';
		exit;
	}

	$result	= $weixin_reply->response_msg();

	if(is_wp_error($result)){
		error_log('微信回复错误: ' . $result->get_error_message());
		echo ' ';
	} else {
		$response	= $weixin_reply->get_response();
		$message	= $weixin_reply->get_message();

		// 尝试保存消息记录，但不影响主要功能
		try {
			WEIXIN_Message::insert(array_merge($message, ['Response'=>$response]));
		} catch (Exception $e) {
			error_log('微信消息保存失败: ' . $e->getMessage());
		}

		do_action('weixin_message', $message, $response);	// 数据统计
	}
} catch (Exception $e) {
	error_log('微信回复处理错误: ' . $e->getMessage());
	echo ' ';
} catch (Error $e) {
	error_log('微信回复致命错误: ' . $e->getMessage());
	echo ' ';
}
}

exit;


